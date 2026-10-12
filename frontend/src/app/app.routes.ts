import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/guards';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/landing/landing.page').then((m) => m.LandingPage) },
  { path: 'login', loadComponent: () => import('./pages/auth/login.page').then((m) => m.LoginPage) },
  { path: 'register', loadComponent: () => import('./pages/auth/register.page').then((m) => m.RegisterPage) },
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
    canActivate: [authGuard],
  },
  {
    path: 'video',
    loadComponent: () => import('./pages/video/video.page').then((m) => m.VideoPage),
    canActivate: [authGuard],
  },
  {
    path: 'text',
    loadComponent: () => import('./pages/text/text.page').then((m) => m.TextPage),
    canActivate: [authGuard],
  },
  {
    path: 'profile',
    loadComponent: () => import('./pages/profile/profile.page').then((m) => m.ProfilePage),
    canActivate: [authGuard],
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage),
    canActivate: [authGuard],
  },
  {
    path: 'friends',
    loadComponent: () => import('./pages/friends/friends.page').then((m) => m.FriendsPage),
    canActivate: [authGuard],
  },
  {
    path: 'premium',
    loadComponent: () => import('./pages/premium/premium.page').then((m) => m.PremiumPage),
    canActivate: [authGuard],
  },
  {
    path: 'safety',
    loadComponent: () => import('./pages/safety/safety.page').then((m) => m.SafetyPage),
  },
  {
    path: 'admin',
    loadComponent: () => import('./pages/admin/admin.page').then((m) => m.AdminPage),
    canActivate: [authGuard, adminGuard],
  },
  { path: 'not-found', loadComponent: () => import('./pages/not-found/not-found.page').then((m) => m.NotFoundPage) },
  { path: '**', redirectTo: 'not-found' },
];
