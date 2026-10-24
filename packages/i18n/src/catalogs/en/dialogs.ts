/**
 * Diálogos del documento y del workspace: cambios sin guardar, conflicto,
 * guardar todos, cerrar pestañas y diálogos de fichero
 * (barrido i18n: módulo «shell»).
 *
 * Los botones destructivos conservan todo su contexto (guía de microcopy §6:
 * texto protegido): nombran exactamente qué se pierde.
 */
export const dialogs = {
  unsavedChanges: {
    title: 'Unsaved changes',
    close: '“{name}” has unsaved changes and you are about to close its tab.',
    windowClose: 'You are about to exit the app and “{name}” has unsaved changes.',
    saveAndClose: 'Save and close',
    saveAndLeave: 'Save and exit',
  },
  conflict: {
    title: 'The file changed on disk',
    /** Continúa la frase tras la ruta (el nombre del fichero va aparte, en mono). */
    description:
      'was modified outside the app (another app or a sync) and you have unsaved changes. Nothing is lost yet: choose which version to keep.',
    saveAs: 'Save as…',
    overwrite: 'Save and overwrite the file',
    reload: 'Reload from disk (discard my changes)',
    later: 'Not now',
  },
  saveAll: {
    tabs: 'You are about to close tabs and {count, plural, one {there is # report} other {there are # reports}} with unsaved changes. If any report cannot be saved, nothing is closed and its error stays visible.',
    window:
      'You are about to exit the app and {count, plural, one {there is # report} other {there are # reports}} with unsaved changes. If any report cannot be saved, nothing is closed and its error stays visible.',
    discardAll: 'Discard all',
    saveAll: 'Save all',
  },
  update: {
    title: 'Software update',
    checking: 'Checking for updates…',
    upToDate: 'You are on the latest version ({version}).',
    availableTitle: 'Version {version} is available',
    availableDescription:
      'You are using version {current}. Update to get the latest changes; your open reports are not touched.',
    notInstallable:
      'This copy was not set up with the installer, so it cannot update itself. Download the new version from the releases page.',
    notesHeading: 'Release notes',
    noNotes: 'No release notes are available for this version.',
    download: 'Update now',
    later: 'Later',
    skip: 'Skip this version',
    openReleasePage: 'Open download page',
    downloading: 'Downloading version {version}… {percent}%',
    readyTitle: 'Version {version} is ready to install',
    readyDescription:
      'Restart to finish updating. You will be asked about unsaved changes first, and Windows may ask for permission. If you choose Later, it installs the next time you close the app.',
    restart: 'Restart and install',
    errorTitle: 'Could not check for updates',
    errorDescription: 'Check your internet connection and try again.',
    retry: 'Try again',
  },
} as const;
