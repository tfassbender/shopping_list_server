import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode } from 'react'
import { t } from '../i18n/messages'

/**
 * A vertical list whose rows can be reordered by dragging the handle (⠿) – with mouse, finger or keyboard
 * (focus the handle, Space to lift, arrow keys to move, Space to drop). Built on dnd-kit.
 *
 * Touch: dragging starts after a short press (150 ms) so normal scrolling of the page still works.
 * The parent owns the order: `onReorder` receives the new id order.
 */
export function SortableList<T>(props: {
  items: T[]
  getId: (item: T) => string
  getLabel: (item: T) => string
  renderItem: (item: T) => ReactNode
  onReorder: (ids: string[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const ids = props.items.map(props.getId)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    props.onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {props.items.map((item) => (
            <SortableRow key={props.getId(item)} id={props.getId(item)} label={props.getLabel(item)}>
              {props.renderItem(item)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  // While dragging, dnd-kit moves the row with a CSS transform; zIndex keeps it above its neighbours.
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }
  return (
    <li ref={setNodeRef} style={style} className={`relative flex items-center bg-white dark:bg-gray-900 ${isDragging ? 'shadow-lg' : ''}`}>
      <button
        {...attributes}
        {...listeners}
        aria-label={t('sortable.handle', { name: label })}
        className="flex min-h-12 w-11 shrink-0 cursor-grab touch-none items-center justify-center text-gray-400"
      >
        ⠿
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  )
}
