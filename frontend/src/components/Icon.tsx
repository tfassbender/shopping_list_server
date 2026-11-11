import {
  faArrowDownWideShort,
  faBroom,
  faCheck,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faClockRotateLeft,
  faCopy,
  faEllipsis,
  faEllipsisVertical,
  faGear,
  faListUl,
  faMicrophone,
  faPencil,
  faPenToSquare,
  faPlus,
  faRightFromBracket,
  faStore,
  faTags,
  faTrashCan,
  faUserGroup,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

/*
 * All icons of the app (Font Awesome Free, solid style) under names that say what they mean here. Each
 * icon is imported on its own, so only these end up in the bundle. To change an icon, change it here.
 */
const ICONS = {
  back: faChevronLeft,
  menu: faEllipsisVertical,
  more: faEllipsis,
  next: faChevronRight,
  dropdown: faChevronDown,
  add: faPlus,
  check: faCheck,
  edit: faPencil,
  rename: faPenToSquare,
  copy: faCopy,
  delete: faTrashCan,
  removeChecked: faBroom,
  sortChecked: faArrowDownWideShort,
  microphone: faMicrophone,
  categories: faTags,
  shops: faStore,
  history: faClockRotateLeft,
  newList: faListUl,
  spaces: faUserGroup,
  settings: faGear,
  leave: faRightFromBracket,
}

export type IconName = keyof typeof ICONS

/**
 * An icon as large as the surrounding text (1em) - set the size with a text size class, e.g. `text-xl`.
 * Icons are decoration (`aria-hidden`); the button around them carries the label for screen readers.
 */
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <FontAwesomeIcon icon={ICONS[name]} className={className} aria-hidden="true" />
}
