# Terra Invicta Transfer Math

Reverse-engineered from `Assembly-CSharp.dll` (namespace `PavonisInteractive.TerraInvicta`).
All code uses **SI units** (meters, seconds, kg, radians) internally.

---

## Units & Constants

| Constant | Value | Notes |
|---|---|---|
| G | 6.67384 × 10⁻¹¹ m³/(kg·s²) | Used as `G * mass_kg` for μ |
| π | 3.1415926535897931 | |
| 2π | 6.2831853071795862 | Used in period calculations |

No AU-based GM constant — the game works in meters everywhere and computes
μ = G·M from body mass on the fly via `TISpaceObjectState.get_mu()`.

---

## Data Structures

### `OrbitalElementsState` (struct, line 1082293)

```
epoch               : DateTime
longAscendingNode_Rad : f64
argPeriapsis_Rad      : f64
inclination_Rad       : f64
semiMajorAxis_m       : f64
eccentricity          : f64
meanAnomalyAtEpoch_Rad: f64
```

Derived properties: `periapsis_m = a(1−e)`, `apoapsis_m = a(1+e)`, `normalVector`,
`ascendingNodeVector`, `periapsisVector`, `eccentricVector`.

### `CartesianState` (struct, line 1081597)

```
position : Vector3d
velocity : Vector3d
```

Conversion: `CartesianState.ToOrbitalElementsState(mu, epoch)` and
`OrbitalElementsState.ToCartesianStateAtTime(mu, time)`.

### `TransferResult` (class, line 1072328)

```
Result : Outcome enum
Value  : f64
Value2 : f64
```

**Outcome enum** — 20 values:

| Value | Name |
|---|---|
| 0 | Success |
| 1 | Fail_InsufficientDV |
| 2 | Fail_ArrivalBeforeLaunch |
| 3 | Fail_LaunchInPast |
| 4 | Fail_CoastPhaseEndsBeforeItStarts |
| 5 | Fail_Parabolic |
| 6 | Fail_Hyperbolic |
| 7 | Fail_HyperbolicMicrothrust |
| 8 | Fail_InsufficientAcceleration |
| 9 | Fail_OrbitPeriod |
| 10 | Fail_ExceedsMaxDuration |
| 11 | Fail_BurnLongerThanTransfer |
| 12 | Fail_BurnLongerThanHalfOrbit |
| 13 | Fail_BurnNaN |
| 14 | Fail_WouldCollideWithBody |
| 15 | Fail_WouldExceedHillRadius |
| 16 | Fail_AttemptedFleetInterceptInMicrothrust |
| 17 | Fail_AttemptedFleetInterceptAfterArrivalAtAsset |
| 18 | Fail_AttemptedFleetInterceptThatWouldCauseTargetingLoop |
| 19 | Fail_CodePathNotImplemented |

`TransferResult.Best(a, b)` picks: success over failure, then lowest dV needed
(`TryGetMinimumDVneeded_mps`), then lowest acceleration needed.

---

## Kepler Solver

**`OrbitalElementsState.GetEccentricAnomalyFromMeanAnomaly(M)`** (line 1083745)

### Elliptical (e < 1)

Newton-Raphson with clamped eccentricity:

```
e' = min(e, 0.9)          // stability clamp
E₀ = M                    // initial guess
Eₙ₊₁ = Eₙ − (Eₙ − e·sin(Eₙ) − M) / (1 − e'·cos(Eₙ))
```

Convergence: |Eₙ₊₁ − Eₙ| < 1×10⁻⁶, max 1000 iterations.

Note: the denominator uses clamped e' but the numerator uses true e. This gives
slightly slower convergence for high-eccentricity orbits but avoids division
instability near e → 1.

### Hyperbolic (e ≥ 1)

Newton-Raphson on hyperbolic anomaly H:

```
H₀ = M                           if |M| ≤ 10
H₀ = sign(M)·ln(|M|/e)          if |M| > 10

Hₙ₊₁ = Hₙ − (e·sinh(Hₙ) − Hₙ − M) / (e·cosh(Hₙ) − 1)
```

Same convergence criteria.

### Anomaly Conversions

**E → ν** (line 1083603):
- Elliptical: `ν = 2·atan2(√(1+e)·sin(E/2), √(1−e)·cos(E/2))`
- Hyperbolic: `ν = acos((cosh(H) − e) / (1 − e·cosh(H)))`, sign matches H

**Orbital period** (line 1083880):
```
T = 2π · √(a³ / (G·M))
```

**Mean anomaly at time** (line 1082665):
- Elliptical: `M(t) = M₀ + 2π·Δt/T`
- Hyperbolic: `M(t) = √(μ/(−a)³) · Δt`

---

## Lambert Solver

**`LambertEquations.SolveLambert()`** (struct, lines 866138–867364)

This is **Izzo's algorithm** ("Revisiting Lambert's Problem", 2014) using the
Lancaster-Blanchard parameterization with Householder iteration.

### Fields

```
lambda, lambda2, lambda3  : f64    // geometry parameters (λ, λ², λ³)
initialVelocity, finalVelocity : Vector3d
burn0, burn1               : Vector3d  // delta-V vectors
```

### Signature

```
SolveLambert(
    TransitTimeSeconds : f64,
    InitialState       : CartesianState,
    EndState           : CartesianState,
    barycenterMu       : f64,
    bRetrograde        : bool = false,
    bFastPass          : bool = false
) → f64  // returns total ΔV = |burn0| + |burn1|
```

### Algorithm

**1. Geometry setup** (lines 866285–866380):

```
r1, r2 = |pos1|, |pos2|
c  = √(r1² + r2² − 2·dot(pos1, pos2))    // chord
s  = (c + r1 + r2) / 2                     // semi-perimeter
λ² = max(0, 1 − c/s)
λ  = √(λ²)
```

**2. Orbit plane** (lines 866327–866365):

Normal vector `n̂ = normalize(r̂₁ × r̂₂)`. If nearly coplanar
(`|n̂|² < 0.5`), falls back to averaging angular momentum normals:
`n̂ = normalize(normalize(r₁×v₁) + normalize(r₂×v₂))`.

If `n̂.z < 0`, negate λ (transfer goes the "other way").
If `bRetrograde`, negate λ again and flip tangent vectors.

**3. Tangent vectors**:

```
if n̂.z ≥ 0:  t̂₁ = n̂ × r̂₁,  t̂₂ = n̂ × r̂₂
if n̂.z < 0:  t̂₁ = r̂₁ × n̂,  t̂₂ = r̂₂ × n̂
```

**4. Time normalization** (lines 866434–866445):

```
T = √(2μ/s³) · TransitTimeSeconds
```

**5. Initial guess for x** (lines 866457–866522):

Three regimes based on T relative to critical values:

```
T₀ = acos(λ) + λ·√(1 − λ²)       // minimum-energy T
T₁ = ⅔·(1 − λ³)                   // parabolic T

if T ≥ T₀:    x₀ = −(T − T₀) / (T − T₀ + 4)
if T ≤ T₁:    x₀ = 1 + T₁·(T₁ − T) · 0.4·(1 − λ²·λ³)/T
if T₁ < T < T₀: x₀ = (T/T₀)^(ln2 / ln(T₁/T₀)) − 1
```

The last case uses a power-law interpolation with the constant
`0.69314718... = ln(2)`.

**6. Householder iteration** (lines 866693–866794):

3rd-order Householder's method on `f(x) = T(x) − T_target`:

```
x₀ given by initial guess
repeat (max 15 iterations, tol = 1×10⁻¹¹):
    T_x = xToTimeOfTransit(x)
    compute DT, DDT, DDDT via dTdx(x, T_x)
    δ = T_x − T_target
    x_new = x − δ · (DT² − δ·DDT/2) / (DT·(DT² − δ·DDT) + DDDT·δ²/6)
```

If result is NaN/Infinity (nearly parabolic), falls back to the initial guess.

**7. Time-of-flight function `xToTimeOfTransit(x)`** (lines 866796–866901):

Depends on the sign of `z = 1/(1 − x²)`:

**Elliptic (z > 0):**
```
ψ  = 2·acos(x)
φ  = 2·asin(√(λ²/z))         // negated if λ < 0
T  = z·√z · (ψ − sin(ψ) − (φ − sin(φ))) / 2
```

**Hyperbolic (z ≤ 0):**
```
ψ  = 2·acosh(x)
φ  = 2·asinh(√(−λ²/z))      // negated if λ < 0
T  = (−z)·√(−z) · (sinh(ψ) − ψ − (sinh(φ) − φ)) / 2
```

**8. Derivatives `dTdx(DT, DDT, DDDT, x, T)`** (lines 867219–867338):

Computes first three derivatives of T(x) analytically:

```
w = 1 − x²
y = 1 − λ²·w
g = √y
h = y·g

DT  = (1/w) · (3T·x − 2 + 2λ³·x/g)
DDT = (1/w) · (3T + 5x·DT + 2(1−λ²)·λ³/h)
DDDT = (1/w) · (7x·DDT + 8·DT − 6(1−λ²)·λ²·λ³·x/(h·y))
```

**9. Velocity reconstruction** (lines 866550–866678):

```
γ = √(μ·s/2)
ρ = (r1 − r2) / c
σ = √(1 − ρ²)
W = √(1 − λ²·x² + λ²)         // (renamed from code's V_18)

v_r1 = γ · (λ·W − x − ρ·(λ·W + x)) / r1
v_r2 = −γ · (λ·W − x + ρ·(λ·W + x)) / r2
v_t1 = γ · σ · (W + λ·x) / r1
v_t2 = γ · σ · (W + λ·x) / r2

initialVelocity = v_r1·r̂₁ + v_t1·t̂₁
finalVelocity   = v_r2·r̂₂ + v_t2·t̂₂

burn0 = initialVelocity − v₁    // departure ΔV
burn1 = v₂ − finalVelocity      // arrival ΔV
return |burn0| + |burn1|
```

---

## Hohmann Transfers

All in **`MasterTransferPlanner`** (line 867366), static methods.

### First burn ΔV (line 892819)

```
ΔV₁ = |√(μ/r₁) · (√(2r₂/(r₁+r₂)) − 1)|
```

### Final burn ΔV (line 892845)

```
ΔV₂ = |√(μ/r₂) · (1 − √(2r₁/(r₁+r₂)))|
```

### Total ΔV (line 892871)

```
ΔV = ΔV₁ + ΔV₂
```

### Transfer duration (line 892894)

```
a_transfer = (r₁ + r₂) / 2
t = π · √(a³/μ)
```

### Synodic period (line 892939)

```
T₁ = 2π · √(a₁³/μ)
T₂ = 2π · √(a₂³/μ)

if a₁ = a₂:     return ∞
if T₁ ≈ T₂:     return max(T₁,T₂) · 10      // degenerate case
else:            return |T₁·T₂ / (T₁ − T₂)|  // clamped to max(T₁,T₂)·10
```

---

## Transfer Planner Pipeline

**`MasterTransferPlanner`** (MonoBehaviour, line 867366) orchestrates everything.

### Nested types

- **`TrajectoryQueue`** — request struct: fleet, destination, callback, commonBarycenter,
  origin/destination orbital elements, sweep range
- **`HohmannTiming`** — stores initialHohmannArrivalTime, transferDuration_s,
  synodicPeriod_s, range of Hohmann windows to search
- **`SimplifiedPositions`** — originDist_m, destinationDist_m, commonBarycenter
- **`TransferCalculatorParameters`** — origin, destination ITransferTarget
- **`CalculateImpulseMicrothrustHybridTransfer_Params`** — params for hybrid transfers

### Data flow

1. **`RequestTrajectories(fleet, destination, callback)`** — entry point
2. **`GetBestHohmannArrivalTime()`** — finds optimal Hohmann window, computes
   synodic period, generates list of (launch, arrival) time pairs via
   `HohmannTiming.GetHohmannTimings(sampleSizeMultiplier)`
3. **Lambert sweep** — for each window, calls `LambertEquations.SolveLambert()`
   with prograde and retrograde passes
4. **Microthrust check** — if fleet has low-thrust capability,
   `CalculateMicrothrustTransfer()` computes spiral alternatives
5. **Hybrid transfers** — `CalculateImpulseMicrothrustHybridTransfer()` combines
   impulsive burns (SOI escape/capture) with microthrust spirals
6. **Validation** — checks ΔV budget, time constraints, collision with bodies,
   Hill radius limits
7. **Selection** — `TransferResult.Best()` picks optimal trajectory
8. **Callback** — returns `Trajectory[]` to UI

---

## Inclination Change Transfer

**`InclinationChangeTransfer`** (line 865281)

Fields: `outgoingOrbit`, `incomingOrbit` (OrbitalElementsState),
`intermediate_burn_DV`, `intermediateBurnTime`.

`Solve()` computes a combined plane-change + orbit-raise maneuver, creating an
intermediate orbit. Uses a helper `eccentricity(apoapsis, periapsis)` for shaping.

---

## Microthrust Transfers

**`MicrothrustTransfer`** (line 893265) — low-thrust spiral model.

**`MicrothrustSphere`** (line 893051) — SOI-constrained spiral:
- `Radius_m` — sphere of influence radius
- `IsLimitedBySphereOfInfluence` — whether spiral is SOI-bounded
- `GetAnomalyDelta_Rad(f64)` — anomaly change during spiral
- `GetDuration_s(f64)` — time for spiral segment

Handles inclination changes (`initialInclination_rad`, `destinationInclination_rad`)
and SOI transitions between barycenters.

---

## Trajectory Types

**`Trajectory`** (abstract, line 1043264):
- `arrivalTime`, `destinationOrbit`, `destination`
- `GetOrbitalElementsAtTime(time)`
- `IsInsideBarycenterSOI(barycenter, time)`

**`Trajectory_Patched`** — patched conics with multiple segments (SOI transitions)

**`Trajectory_Microthrust`** — continuous low-thrust spiral paths

---

## Differences from Our Implementation

Our transfer planner (`src/lib/orbital/`) uses:
- **Universal variable** Lambert solver with Stumpff functions + bisection-assisted Newton
- **AU + AU/yr** units with GM_SUN = 4π²
- Web worker porkchop grid

The game uses:
- **Izzo (2014) Lambert solver** with Householder iteration on the λ-parameterization
- **SI units** (meters, seconds) throughout
- Hohmann windows as search anchors, Lambert sweep around each window
- Hybrid impulsive + microthrust transfers
- Patched conics for multi-SOI trajectories
- Body-specific μ = G·M (not a single solar GM)

The Izzo solver is generally considered faster and more robust than universal
variable approaches, particularly for multi-revolution cases and near-parabolic
transfers. The 3rd-order Householder iteration converges in ~3–5 steps vs our
bisection-assisted Newton which may need 30+.
