// --- Supabase 초기화 ---
const SUPABASE_URL = 'https://nysjoqpbycoalthsyydc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_RB444YoSHzHkeA6-eHSL4Q_YCMTnn1o'
const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

const PRIORITY_ORDER = { high: 1, medium: 2, low: 3 }
const PRIORITY_LABEL = { high: '높음', medium: '중간', low: '낮음' }
let todos = []
let dragId = null

// --- DB 연동 ---

async function loadTodos() {
  const { data, error } = await db
    .from('todos')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) { console.error('loadTodos:', error); return; }
  todos = data
}

// 드래그·추가·삭제 후 배열 순서를 DB에 일괄 반영
async function syncSortOrders() {
  if (todos.length === 0) return
  const updates = todos.map((t, i) => ({ id: t.id, sort_order: i }))
  const { error } = await db.from('todos').upsert(updates)
  if (error) { console.error('syncSortOrders:', error); return; }
  todos.forEach((t, i) => { t.sort_order = i })
}

// --- 렌더링 ---

function getSelectedPriority() {
  const chip = document.querySelector('#priority-chips .chip-selected')
  return chip ? chip.dataset.value : 'medium'
}

function updateEmptyState() {
  document.getElementById('empty-state').classList.toggle('visible', todos.length === 0)
}

function renderTodos() {
  const list = document.getElementById('todo-list')
  list.innerHTML = ''

  todos.forEach(todo => {
    const li = document.createElement('li')
    li.className = `todo-item priority-${todo.priority}` + (todo.completed ? ' completed' : '')
    li.draggable = true
    li.dataset.id = String(todo.id)

    li.addEventListener('dragstart', onDragStart)
    li.addEventListener('dragover',  onDragOver)
    li.addEventListener('dragleave', onDragLeave)
    li.addEventListener('drop',      onDrop)
    li.addEventListener('dragend',   onDragEnd)

    const handle = document.createElement('span')
    handle.className = 'drag-handle'
    handle.textContent = '⠿'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = todo.completed
    checkbox.addEventListener('change', () => toggleTodo(todo.id))

    const badge = document.createElement('span')
    badge.className = `priority-badge badge-${todo.priority}`
    badge.textContent = PRIORITY_LABEL[todo.priority]

    const span = document.createElement('span')
    span.className = 'todo-text'
    span.textContent = todo.text

    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'delete-btn'
    deleteBtn.setAttribute('aria-label', '삭제')
    deleteBtn.innerHTML = '<span class="material-icons-round">close</span>'
    deleteBtn.addEventListener('click', () => deleteTodo(todo.id))

    li.append(handle, checkbox, badge, span, deleteBtn)
    list.appendChild(li)
  })

  updateEmptyState()
}

// --- CRUD ---

async function addTodo() {
  const input = document.getElementById('todo-input')
  const text = input.value.trim()
  if (!text) return

  const priority = getSelectedPriority()

  // 같은/상위 우선순위 항목 다음 위치 계산
  let insertAt = 0
  for (let i = 0; i < todos.length; i++) {
    if (PRIORITY_ORDER[todos[i].priority] <= PRIORITY_ORDER[priority]) insertAt = i + 1
  }

  const { data, error } = await db
    .from('todos')
    .insert({ text, completed: false, priority, sort_order: insertAt })
    .select()
    .single()
  if (error) { console.error('addTodo:', error); return; }

  todos.splice(insertAt, 0, data)
  await syncSortOrders()
  renderTodos()
  input.value = ''
  input.focus()
}

async function toggleTodo(id) {
  const todo = todos.find(t => t.id === id)
  if (!todo) return
  const { error } = await db
    .from('todos')
    .update({ completed: !todo.completed })
    .eq('id', id)
  if (error) { console.error('toggleTodo:', error); return; }
  todos = todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t)
  renderTodos()
}

async function deleteTodo(id) {
  const { error } = await db.from('todos').delete().eq('id', id)
  if (error) { console.error('deleteTodo:', error); return; }
  todos = todos.filter(t => t.id !== id)
  await syncSortOrders()
  renderTodos()
}

// --- Drag & Drop ---

function onDragStart(e) {
  dragId = Number(this.dataset.id)
  this.classList.add('dragging')
  e.dataTransfer.effectAllowed = 'move'
}

function clearDropIndicators() {
  document.querySelectorAll('.todo-item').forEach(el =>
    el.classList.remove('drop-above', 'drop-below')
  )
}

function onDragOver(e) {
  e.preventDefault()
  if (Number(this.dataset.id) === dragId) return
  clearDropIndicators()
  const rect = this.getBoundingClientRect()
  this.classList.add(e.clientY > rect.top + rect.height / 2 ? 'drop-below' : 'drop-above')
}

function onDragLeave() {
  this.classList.remove('drop-above', 'drop-below')
}

async function onDrop(e) {
  e.preventDefault()
  const targetId = Number(this.dataset.id)
  if (targetId === dragId) return

  const rect = this.getBoundingClientRect()
  const isBelow = e.clientY > rect.top + rect.height / 2

  const dragIndex   = todos.findIndex(t => t.id === dragId)
  const targetIndex = todos.findIndex(t => t.id === targetId)
  if (dragIndex === -1 || targetIndex === -1) return

  const [dragged] = todos.splice(dragIndex, 1)
  dragged.priority = todos[todos.findIndex(t => t.id === targetId)].priority

  const newTargetIndex = todos.findIndex(t => t.id === targetId)
  todos.splice(isBelow ? newTargetIndex + 1 : newTargetIndex, 0, dragged)

  // priority 변경 + 전체 순서 동기화
  await db.from('todos').update({ priority: dragged.priority }).eq('id', dragged.id)
  await syncSortOrders()
  renderTodos()
}

function onDragEnd() {
  clearDropIndicators()
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'))
  dragId = null
}

// --- Init ---

document.addEventListener('DOMContentLoaded', async () => {
  await loadTodos()
  renderTodos()

  document.getElementById('add-btn').addEventListener('click', addTodo)
  document.getElementById('todo-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addTodo()
  })

  document.querySelectorAll('#priority-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#priority-chips .chip').forEach(c => c.classList.remove('chip-selected'))
      chip.classList.add('chip-selected')
    })
  })
})
