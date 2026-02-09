# CLAUDE.md

## Git workflow

After finishing work, always commit and push. Use atomic, conventional commits — each commit should represent a single logical change. Use conventional commit prefixes (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, etc.) in commit messages.

## Styling

Always use Tailwind utility classes. Avoid inline `style={{}}` props and custom CSS classes when Tailwind can express the same thing. The only acceptable use of inline styles is for truly dynamic/computed values that can't be represented as Tailwind classes (e.g. a runtime-calculated opacity).

## Linting

Never disable oxlint rules. If a lint rule flags your code, fix the code instead of suppressing the warning.
