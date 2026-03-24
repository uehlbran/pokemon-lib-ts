const PUBLISHABLE_PATH_PATTERN = /^packages\/[^/]+\/(?:src|data)\//;
const CHANGESET_PATH_PATTERN = /^\.changeset\/[^/]+\.md$/;

export function normalizeFileList(files) {
  return files.map((file) => file.trim()).filter(Boolean);
}

export function findPublishablePackageFiles(files) {
  return normalizeFileList(files).filter((file) => PUBLISHABLE_PATH_PATTERN.test(file));
}

export function findChangesetFiles(files) {
  return normalizeFileList(files).filter(
    (file) => CHANGESET_PATH_PATTERN.test(file) && !file.endsWith("README.md"),
  );
}

export function extractTouchedPackages(files) {
  return [...new Set(findPublishablePackageFiles(files).map((file) => file.split("/")[1]))].sort();
}

export function validateChangesetRequirement({ changedFiles, changesetFiles }) {
  const publishableFiles = findPublishablePackageFiles(changedFiles);
  const validChangesets = findChangesetFiles(changesetFiles);

  if (publishableFiles.length === 0) {
    return {
      isValid: true,
      requiresChangeset: false,
      touchedPackages: [],
    };
  }

  return {
    isValid: validChangesets.length > 0,
    requiresChangeset: true,
    touchedPackages: extractTouchedPackages(publishableFiles),
  };
}
