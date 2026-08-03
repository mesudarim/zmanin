import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      redirect: '/dashboard'
    },
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true }
    },
    {
      path: '/auth/callback',
      name: 'AuthCallback',
      component: () => import('@/views/AuthCallbackView.vue'),
      meta: { public: true }
    },
    // ── Profile (all authenticated users) ───────────────────────────────────
    {
      path: '/profile',
      name: 'Profile',
      component: () => import('@/views/employee/ProfileView.vue'),
      meta: { requiresAuth: true }
    },
    // ── Employee routes ─────────────────────────────────────────────────────
    {
      path: '/dashboard',
      name: 'EmployeeDashboard',
      component: () => import('@/views/employee/DashboardView.vue'),
      meta: { requiresAuth: true, role: 'employee' }
    },
    {
      path: '/report',
      name: 'EmployeeReport',
      component: () => import('@/views/employee/ReportView.vue'),
      meta: { requiresAuth: true, role: 'employee' }
    },
    // ── Admin routes ─────────────────────────────────────────────────────────
    {
      path: '/admin',
      name: 'AdminDashboard',
      component: () => import('@/views/admin/DashboardView.vue'),
      meta: { requiresAuth: true, role: 'admin' }
    },
    {
      path: '/admin/employees',
      name: 'AdminEmployees',
      component: () => import('@/views/admin/EmployeesView.vue'),
      meta: { requiresAuth: true, role: 'admin' }
    },
    {
      path: '/admin/employees/:uid/report',
      name: 'AdminEmployeeReport',
      component: () => import('@/views/admin/EmployeeReportView.vue'),
      meta: { requiresAuth: true, role: 'admin' }
    },
    {
      path: '/admin/employees/:uid/time-entry',
      name: 'AdminTempTimeEntry',
      component: () => import('@/views/admin/TempTimeEntryView.vue'),
      meta: { requiresAuth: true, role: 'admin' }
    },
    {
      path: '/admin/config',
      name: 'AdminConfig',
      component: () => import('@/views/admin/ConfigView.vue'),
      meta: { requiresAuth: true, role: 'admin' }
    },
    {
      path: '/admin/reports',
      name: 'AdminReports',
      component: () => import('@/views/admin/AdminReportsView.vue'),
      meta: { requiresAuth: true, role: 'admin' }
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // Wait for Firebase auth to resolve on first load
  if (auth.loading) {
    await auth.init()
  }

  if (to.meta.public) return true

  if (!auth.isAuthenticated) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }

  // Redirect admin landing: / → /admin
  if (to.name === 'Home' && auth.isAdmin) {
    return { name: 'AdminDashboard' }
  }

  // Non-admins cannot access admin routes
  if (to.meta.role === 'admin' && !auth.isAdmin) {
    return { name: 'EmployeeDashboard' }
  }
  // Admins CAN access employee routes (clock-in, personal report)

  return true
})

export default router
