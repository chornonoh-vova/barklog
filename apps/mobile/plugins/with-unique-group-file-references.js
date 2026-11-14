// Config plugins are loaded by `expo prebuild` as CommonJS, before any bundler runs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withXcodeProject } = require("expo/config-plugins");

// expo-sharing and expo-widgets each add their extension's group with the `xcode`
// package's `addPbxGroup`, which reuses any PBXFileReference that already has the
// same `path`. Both extensions own a group-relative `Info.plist`, so whichever
// plugin runs second lists the other target's `Info.plist` reference in its own
// group. Xcode 27.2 refuses such a project ("The reference "Info.plist" is a member
// of more than one group") and `expo run:ios` fails with "does not contain a
// scheme". https://github.com/expo/expo/issues/52987
//
// Fixed upstream for SDK 59 (expo/expo#53205, #53206) but not in any SDK 58
// release; drop this plugin once both packages ship the fix. This applies the same
// repair: every group after the first one to list a file reference gets its own
// copy. A group-relative path then resolves inside that group's own folder.
//
// Must be listed BEFORE expo-sharing and expo-widgets in app.json: a mod runs its
// own action and then the mods of plugins listed earlier, so the earliest-listed
// plugin edits the project last.

/**
 * Gives each PBXGroup its own PBXFileReference for every file it lists, cloning
 * any reference another group already holds. Mutates `project`.
 *
 * @param {import("xcode").XcodeProject} project
 */
function giveEachGroupItsOwnFileReferences(project) {
  const objects = project.hash.project.objects;
  const groups = objects.PBXGroup ?? {};
  const fileReferences = objects.PBXFileReference ?? {};
  const claimed = new Set();

  for (const [key, group] of Object.entries(groups)) {
    if (key.endsWith("_comment") || !Array.isArray(group.children)) continue;

    group.children = group.children.map((child) => {
      const reference = fileReferences[child.value];
      // Subgroups and variant groups are not file references.
      if (reference === undefined) return child;

      if (!claimed.has(child.value)) {
        claimed.add(child.value);
        return child;
      }

      const uuid = project.generateUuid();
      fileReferences[uuid] = { ...reference };
      fileReferences[`${uuid}_comment`] = fileReferences[`${child.value}_comment`];
      return { ...child, value: uuid };
    });
  }
}

/** @type {import("expo/config-plugins").ConfigPlugin} */
const withUniqueGroupFileReferences = (config) =>
  withXcodeProject(config, (projectConfig) => {
    giveEachGroupItsOwnFileReferences(projectConfig.modResults);
    return projectConfig;
  });

module.exports = withUniqueGroupFileReferences;
