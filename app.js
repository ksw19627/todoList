// --- Supabase 초기화 ---
const SUPABASE_URL = 'https://nysjoqpbycoalthsyydc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_RB444YoSHzHkeA6-eHSL4Q_YCMTnn1o'
const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

const PRIORITY_ORDER = { high: 1, medium: 2, low: 3 }
const PRIORITY_LABEL = { high: '높음', medium: '중간', low: '낮음' }
let todos = []
let dragId = null
let currentUser = null

// --- Auth 뷰 전환 ---

function showAuthView() {
  document.getElementById('auth-view').classList.remove('hidden')
  document.getElementById('todo-view').classList.add('hidden')
  document.getElementById('user-info').classList.add('hidden')
  document.getElementById('auth-message').textContent = ''
  document.getElementById('auth-email').value = ''
  document.getElementById('auth-password').value = ''
}

function showTodoView() {
  document.getElementById('auth-view').classList.add('hidden')
  document.getElementById('todo-view').classList.remove('hidden')
  document.getElementById('user-info').classList.remove('hidden')
  document.getElementById('user-email').textContent = currentUser.email
}

// --- Auth 처리 ---

async function handleAuth() {
  const email    = document.getElementById('auth-email').value.trim()
  const password = document.getElementById('auth-password').value
  const msgEl    = document.getElementById('auth-message')
  const isSignUp = document.querySelector('.auth-tab.auth-tab-selected').dataset.mode === 'signup'

  msgEl.className = 'auth-message'
  msgEl.textContent = ''

  if (!email || !password) {
    msgEl.textContent = '이메일과 비밀번호를 입력해주세요.'
    return
  }

  if (isSignUp) {
    const { data, error } = await db.auth.signUp({ email, password })
    if (error) { msgEl.textContent = error.message; return }
    if (!data.session) {
      // 이메일 인증이 켜져 있을 때 — 확인 메일 안내
      msgEl.classList.add('auth-message-success')
      msgEl.textContent = '📧 이메일을 확인해 인증 링크를 클릭해주세요.'
    }
    // session이 있으면 onAuthStateChange가 자동으로 투두 뷰로 전환
  } else {
    const { error } = await db.auth.signInWithPassword({ email, password })
    if (error) { msgEl.textContent = error.message; return }
    // 성공 시 onAuthStateChange가 자동으로 투두 뷰로 전환
  }
}

async function signOutUser() {
  await db.auth.signOut()
  // onAuthStateChange가 자동으로 인증 뷰로 복귀
}

// --- DB 연동 ---

async function loadTodos() {
  const { data, error } = await db
    .from('todos')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) { console.error('loadTodos:', error); return }
  todos = data
}

async function syncSortOrders() {
  if (todos.length === 0) return
  const updates = todos.map((t, i) => ({ id: t.id, sort_order: i }))
  const { error } = await db.from('todos').upsert(updates)
  if (error) { console.error('syncSortOrders:', error); return }
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
  if (!currentUser) return
  const input = document.getElementById('todo-input')
  const text = input.value.trim()
  if (!text) return

  const priority = getSelectedPriority()
  let insertAt = 0
  for (let i = 0; i < todos.length; i++) {
    if (PRIORITY_ORDER[todos[i].priority] <= PRIORITY_ORDER[priority]) insertAt = i + 1
  }

  const { data, error } = await db
    .from('todos')
    .insert({ text, completed: false, priority, sort_order: insertAt, user_id: currentUser.id })
    .select()
    .single()
  if (error) { console.error('addTodo:', error); return }

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
  if (error) { console.error('toggleTodo:', error); return }
  todos = todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t)
  renderTodos()
}

async function deleteTodo(id) {
  const { error } = await db.from('todos').delete().eq('id', id)
  if (error) { console.error('deleteTodo:', error); return }
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

document.addEventListener('DOMContentLoaded', () => {

  // 인증 상태 변화 감지 — 뷰 전환의 핵심
  db.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      currentUser = session.user
      showTodoView()
      await loadTodos()
      renderTodos()
    } else {
      currentUser = null
      todos = []
      showAuthView()
    }
  })

  // 인증 탭 전환
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('auth-tab-selected'))
      tab.classList.add('auth-tab-selected')
      const isSignUp = tab.dataset.mode === 'signup'
      document.getElementById('auth-btn-label').textContent = isSignUp ? '회원가입' : '로그인'
      document.querySelector('#auth-btn .material-icons-round').textContent = isSignUp ? 'person_add' : 'login'
      document.getElementById('auth-message').textContent = ''
    })
  })

  // 인증 버튼 & 키보드
  document.getElementById('auth-btn').addEventListener('click', handleAuth)
  document.getElementById('auth-email').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('auth-password').focus()
  })
  document.getElementById('auth-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAuth()
  })

  // 로그아웃
  document.getElementById('signout-btn').addEventListener('click', signOutUser)

  // 투두 추가 & 우선순위 칩
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
