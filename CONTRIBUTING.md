# Contributing to Raivstream

First off, thank you for considering contributing to Raivstream! It's people like you that make Raivstream such a great platform.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* **Use a clear and descriptive title**
* **Describe the exact steps to reproduce the problem**
* **Provide specific examples to demonstrate the steps**
* **Describe the behavior you observed and what behavior you expected**
* **Include screenshots if possible**
* **Include your environment details** (OS, browser, Node version, etc.)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

* **Use a clear and descriptive title**
* **Provide a detailed description of the suggested enhancement**
* **Provide specific examples to demonstrate the enhancement**
* **Explain why this enhancement would be useful**

### Pull Requests

* Fill in the required template
* Follow the TypeScript styleguide
* Include thoughtfully-worded, well-structured tests
* Document new code
* End all files with a newline

## Development Process

1. **Fork the repo** and create your branch from `main`
2. **Install dependencies**: `pnpm install`
3. **Setup your environment**: Copy `.env.example` to `.env` and fill in values
4. **Make your changes**
5. **Test your changes**: `pnpm test`
6. **Lint your code**: `pnpm lint`
7. **Commit your changes** using conventional commits
8. **Push to your fork** and submit a pull request

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types:
* **feat**: A new feature
* **fix**: A bug fix
* **docs**: Documentation only changes
* **style**: Code style changes (formatting, etc.)
* **refactor**: Code changes that neither fix bugs nor add features
* **perf**: Performance improvements
* **test**: Adding or updating tests
* **chore**: Changes to build process or auxiliary tools

Example:
```
feat(video): add video upload progress indicator

Implement real-time upload progress tracking for video uploads.
Shows percentage and estimated time remaining.

Closes #123
```

## Styleguide

### TypeScript

* Use TypeScript for all new code
* Follow existing code style
* Use meaningful variable names
* Add comments for complex logic
* Use type annotations where helpful

### React/React Native

* Use functional components with hooks
* Keep components small and focused
* Use proper prop types
* Follow React best practices

### Testing

* Write tests for new features
* Maintain test coverage above 80%
* Test edge cases
* Use descriptive test names

## Project Structure

```
raivstream/
├── apps/
│   ├── web/              # Next.js web application
│   └── mobile/           # React Native mobile app
├── packages/
│   ├── database/         # Prisma schema & DB utilities
│   ├── api/              # tRPC API routes
│   ├── jobs/             # Background job functions
│   └── ui/               # Shared UI components
```

## Questions?

Feel free to open an issue with your question or reach out to the maintainers.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
