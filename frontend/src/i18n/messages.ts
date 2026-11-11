/**
 * All user-facing texts in one place. German/English support (Phase 10) will replace this module with a
 * real i18n library; components only use `t(...)`, so they won't need to change.
 */
const en = {
  appName: 'Shopping List',
  'common.loading': 'Loading...',
  'common.save': 'Save',
  'common.saved': 'Saved.',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.rename': 'Rename',
  'common.create': 'Create',
  'common.back': 'Back',
  'common.close': 'Close',
  'common.edit': 'Edit',
  'common.name': 'Name',
  'common.confirmDelete': 'Really delete "{name}"?',

  'spaces.title': 'My spaces',
  'spaces.empty': 'You have no spaces yet. A space holds your lists and can be shared with others - create one below.',
  'spaces.newName': 'Name of a new space',
  'spaces.memberCount': '{count} member(s)',
  'spaces.role.OWNER': 'Owner',
  'spaces.role.MEMBER': 'Member',
  'space.members': 'Members & invites',
  'space.rename': 'Rename space',
  'space.delete': 'Delete space',
  'space.deleteConfirm': 'Delete the space "{name}" with all its lists for all members?',
  'members.you': 'you',
  'members.makeOwner': 'Make owner',
  'members.transferConfirm': 'Hand over ownership to {name}? You will become a normal member.',
  'members.remove': 'Remove',
  'members.removeConfirm': 'Remove {name} from this space?',
  'members.leave': 'Leave space',
  'members.leaveConfirm': 'Leave this space? You need a new invite to come back.',
  'invites.title': 'Invite someone',
  'invites.explanation': 'An invite link can be used by exactly one person.',
  'invites.validFor': 'Valid for',
  'invites.hours.1': '1 hour',
  'invites.hours.24': '1 day',
  'invites.hours.72': '3 days',
  'invites.hours.168': '1 week',
  'invites.hours.720': '30 days',
  'invites.create': 'Create invite link',
  'invites.onceHint': 'Send this link to the person you want to invite. It is shown only once.',
  'invites.link': 'Invite link',
  'invites.share': 'Share link',
  'invites.copy': 'Copy link',
  'invites.copied': 'Copied!',
  'invites.openUntil': 'Open invite, valid until {date}',
  'invites.revoke': 'Revoke',
  'invite.title': 'Invitation',
  'invite.question': '{name} invites you to the space "{space}". Join?',
  'invite.accept': 'Join',
  'health.checking': 'Checking connection...',
  'health.online': 'Connected to server (version {version})',
  'health.offline': 'Server not reachable',
  'notFound.title': 'Page not found',
  'notFound.back': 'Back to start',

  'nav.settings': 'Settings',
  'nav.logout': 'Log out',

  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.newPassword': 'New password',
  'auth.currentPassword': 'Current password',
  'auth.displayName': 'Display name',
  'auth.displayNameHint': 'Other members of your spaces see this name.',
  'auth.passwordHint': 'At least {min} characters.',
  'auth.login.title': 'Log in',
  'auth.login.submit': 'Log in',
  'auth.login.noAccount': 'No account yet? Register',
  'auth.login.forgot': 'Forgot password?',
  'auth.register.title': 'Create account',
  'auth.register.submit': 'Register',
  'auth.register.haveAccount': 'Already registered? Log in',
  'auth.register.checkMail': 'Almost done! We sent a confirmation link to {email}. Open it to activate your account.',
  'auth.verify.title': 'Confirm email',
  'auth.verify.running': 'Confirming your email address...',
  'auth.verify.resend': 'Send confirmation email again',
  'auth.verify.resent': 'If the account exists and is not confirmed yet, we sent a new link.',
  'auth.forgot.title': 'Forgot password',
  'auth.forgot.submit': 'Send reset link',
  'auth.forgot.sent': 'If an account exists for this email, we sent a link to reset the password.',
  'auth.reset.title': 'Choose a new password',
  'auth.reset.submit': 'Set password',
  'auth.emailDisabled': 'Emails are disabled on this server.',

  'settings.title': 'Settings',
  'settings.profile': 'Profile',
  'settings.appearance': 'Display',
  'settings.theme': 'Theme',
  'settings.theme.SYSTEM': 'Like the system',
  'settings.theme.LIGHT': 'Light',
  'settings.theme.DARK': 'Dark',
  'settings.language': 'Language',
  'settings.language.en': 'English',
  'settings.language.de': 'Deutsch',
  'settings.checkedItemsToEnd': 'Move checked items to the end of the list',
  'settings.ignoreMergeWarnings': 'Hide merge warnings',
  'settings.password': 'Change password',
  'settings.passwordChanged': 'Password changed. Other devices were logged out.',
  'settings.sessions': 'Sessions',
  'settings.logoutEverywhere': 'Log out on all other devices',
  'settings.loggedOutEverywhere': 'All other devices were logged out.',
  'settings.dangerZone': 'Delete account',
  'settings.deleteAccount': 'Delete my account',
  'settings.deleteAccountConfirm':
    'Delete your account? Spaces you own are handed over to the longest member or deleted if you are alone. This cannot be undone.',

  'error.unknown': 'Something went wrong. Please try again.',
  'error.NETWORK_ERROR': 'Server not reachable. Check your connection.',
  'error.INVALID_EMAIL': 'Please enter a valid email address.',
  'error.INVALID_DISPLAY_NAME': 'The display name must be 1-40 characters.',
  'error.PASSWORD_TOO_SHORT': 'The password is too short.',
  'error.PASSWORD_TOO_LONG': 'The password is too long.',
  'error.EMAIL_TAKEN': 'This email is already registered.',
  'error.INVALID_CREDENTIALS': 'Wrong email or password.',
  'error.EMAIL_NOT_VERIFIED': 'Please confirm your email address first.',
  'error.INVALID_TOKEN': 'This link is invalid or has expired.',
  'error.WRONG_PASSWORD': 'The current password is wrong.',
  'error.EMAIL_DISABLED': 'Emails are disabled on this server.',
  'error.INVALID_REQUEST': 'Invalid input.',
  'error.FORBIDDEN': 'You are not allowed to do this.',
  'error.NOT_FOUND': 'Not found.',
  'error.INVALID_NAME': 'Please enter a name (max. 60 characters).',
  'error.SPACE_NOT_FOUND': 'This space does not exist or you are not a member.',
  'error.OWNER_ONLY': 'Only the owner of the space can do this.',
  'error.OWNER_CANNOT_LEAVE': 'Hand over ownership to another member before leaving.',
  'error.INVITE_INVALID': 'This invite link is invalid, expired or was already used.',
  'error.ALREADY_MEMBER': 'You are already a member of this space.',
  'error.INVALID_EXPIRY': 'Invalid validity period.',
} as const

export type MessageKey = keyof typeof en

/** Returns the text for `key`, replacing `{name}` placeholders with values from `params`. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return en[key].replace(/\{(\w+)}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

/** Text for a backend error code (`error.<CODE>`), falling back to a generic message. */
export function errorMessage(code: string): string {
  const key = `error.${code}`
  return key in en ? t(key as MessageKey) : t('error.unknown')
}

/** For dynamic keys like `settings.theme.${value}`; falls back to the key itself if it is missing. */
export function tDynamic(key: string, params: Record<string, string | number> = {}): string {
  return key in en ? t(key as MessageKey, params) : key
}
