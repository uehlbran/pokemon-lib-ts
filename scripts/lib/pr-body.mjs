const CLOSING_REF_PATTERN = /\b(?:closes|fixes|resolves)\s+#(\d+)\b/gi;
const NO_ISSUE_PATTERN = /^(?:\s*[-*]\s*)?(?:closes|fixes|resolves)\s*:\s*n\/?a\s*$/im;
const CLOSING_KEYWORD_PATTERN = /\b(?:closes|fixes|resolves)\b/i;
const ISSUE_REF_PATTERN = /#\d+\b/g;

export function extractClosingIssues(body) {
  return [...body.matchAll(CLOSING_REF_PATTERN)].map((match) => Number(match[1]));
}

export function findOrphanedClosingLines(body) {
  return body
    .split(/\r?\n/)
    .filter((line) => CLOSING_KEYWORD_PATTERN.test(line))
    .filter((line) => {
      const keywordPairs = line.match(CLOSING_REF_PATTERN)?.length ?? 0;
      const allRefs = line.match(ISSUE_REF_PATTERN)?.length ?? 0;
      return allRefs > keywordPairs;
    });
}

export function validatePullRequestBody(body) {
  if (typeof body !== "string" || body.trim().length === 0) {
    return {
      isValid: false,
      errors: ["PR body is empty. Include a closing reference or 'Closes: N/A'."],
      closingIssues: [],
      orphanedLines: [],
    };
  }

  if (NO_ISSUE_PATTERN.test(body)) {
    return {
      isValid: true,
      errors: [],
      closingIssues: [],
      orphanedLines: [],
    };
  }

  const closingIssues = extractClosingIssues(body);
  const orphanedLines = findOrphanedClosingLines(body);
  const errors = [];

  if (closingIssues.length === 0) {
    errors.push("PR body must include a closing reference like 'Closes #123' or 'Closes: N/A'.");
  }

  if (orphanedLines.length > 0) {
    errors.push(
      "Each issue needs its own closing keyword. Do not use 'Closes #1, #2' or 'Closes #1 #2'.",
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    closingIssues,
    orphanedLines,
  };
}
