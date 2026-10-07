# Original implementation reference

This folder retains the original dictionary, editing components and unfinished Prompt Pocket foundations from the Lovable project.

- Project: 2d084013-8822-4206-a527-454fbb8efb40
- Source commit: 555b5d9dc1adc5d4662cfeeb224f93399ddd3ff0
- Original base commit: 9f866f9bbbe62436807578798066cec3c07ed3ba

These files are historical reference and are not the runtime app. Known original defects included manual prompt editing/selection synchronization, unsafe corrupt-data reset and strict TypeScript errors. The runnable app is in ../web/ and preserves the original dictionary IDs and legacy LocalStorage migration.

The original Lovable project and browser data were not deleted. Browser storage cannot be copied through Git: importing a backup is needed when changing origins.
