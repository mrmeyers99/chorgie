# Claude PR Review Setup

This repository uses Claude AI to automatically review pull requests instead of GitHub Copilot.

## Setup Instructions

### 1. Get Your Anthropic API Key

1. Visit [Anthropic Console](https://console.anthropic.com/)
2. Sign in or create an account
3. Navigate to API Keys section
4. Create a new API key

### 2. Add API Key to GitHub Secrets

1. Go to your repository settings
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `ANTHROPIC_API_KEY`
5. Value: Your Anthropic API key
6. Click **Add secret**

## How It Works

The workflow (`.github/workflows/claude-pr-review.yml`) automatically:

- Triggers when a PR is opened, updated, or reopened
- Fetches all changed files in the PR
- Sends relevant code changes to Claude for review
- Posts review comments directly on the PR

## Configuration

### Review Focus Areas

The workflow is configured to review:
- Code quality and best practices
- Potential bugs or issues
- Performance considerations
- Security vulnerabilities
- TypeScript/JavaScript specific concerns
- Testing coverage

### Customization

You can customize the review by editing `.github/workflows/claude-pr-review.yml`:

- **Model**: Change the Claude model version (default: `claude-sonnet-4.5-20250929`)
- **Max tokens**: Adjust response length (default: `4096`)
- **Review instructions**: Modify the focus areas and guidelines
- **File filters**: Add/remove file types to review

### File Types Reviewed

By default, the workflow reviews:
- TypeScript files (`.ts`, `.tsx`)
- JavaScript files (`.js`, `.jsx`)
- JSON files (`.json`)
- YAML files (`.yml`, `.yaml`)

## Usage

Once set up, Claude will automatically review all new pull requests. No manual action required!

The review will appear as a comment on the PR with:
- Overall assessment
- Specific issues found
- Suggestions for improvement
- Best practice recommendations

## Troubleshooting

### Workflow not running?

- Check that the `ANTHROPIC_API_KEY` secret is properly set
- Verify the workflow file has correct permissions
- Ensure your PR has changes to files that match the filter patterns

### API rate limits?

- Anthropic API has rate limits based on your plan
- Consider adjusting `max_tokens` to reduce API usage
- You can add conditions to skip reviews for draft PRs

## Cost Considerations

- Each PR review consumes API tokens
- Claude Sonnet is cost-effective for code reviews
- Monitor usage in your Anthropic Console
- Consider setting up usage alerts

## Disabling the Workflow

To temporarily disable Claude reviews:

1. Go to **Actions** tab in your repository
2. Select "Claude PR Review" workflow
3. Click the "..." menu and select "Disable workflow"

Or delete/rename the workflow file: `.github/workflows/claude-pr-review.yml`
