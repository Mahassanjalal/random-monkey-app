import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type {
  BadgeDto,
  BuyCreditsDto,
  CreditProductDto,
  EntitlementsDto,
  GeoLocationDto,
  KarmaDto,
  PlanInfo,
  PreferencesDto,
  ProfileDto,
  UpdatePreferencesDto,
  UpdateProfileDto,
  UpdateGeoDto,
  VerificationDto,
} from '@bundle/shared';

export interface MePayload {
  id: string;
  username: string;
  email: string;
  role: string;
  status: string;
  ageAssurance: string;
  isVerified: boolean;
  onboardingStep: number | null;
  acceptedTermsAt: string | null;
  profile: ProfileDto | null;
  preferences: PreferencesDto | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  me() {
    return this.http.get<MePayload>('/api/users/me');
  }

  deleteMe() {
    return this.http.delete<{ ok: boolean }>('/api/users/me');
  }

  updateProfile(dto: UpdateProfileDto) {
    return this.http.post<{ ok: true }>('/api/profiles/me', dto);
  }

  updatePreferences(dto: UpdatePreferencesDto) {
    return this.http.post<{ ok: true }>('/api/profiles/preferences', dto);
  }

  friends() {
    return this.http.get<{ id: string; username: string; displayName: string; avatarHue: number; isOnline: boolean }[]>('/api/friends');
  }

  friendRequests() {
    return this.http.get<
      { id: string; status: string; fromUserId: string; fromUsername: string; toUserId: string; createdAt: string }[]
    >('/api/friends/requests');
  }

  sendFriendRequest(username: string) {
    return this.http.post('/api/friends/requests', { username });
  }

  respondFriendRequest(id: string, accept: boolean) {
    return this.http.post(`/api/friends/requests/${id}/respond`, { accept });
  }

  removeFriend(friendId: string) {
    return this.http.delete(`/api/friends/${friendId}`);
  }

  blockedList() {
    return this.http.get<{ blockedId: string; createdAt: string }[]>('/api/reports/blocks');
  }

  unblock(userId: string) {
    return this.http.delete(`/api/reports/blocks/${userId}`);
  }

  entitlements() {
    return this.http.get<EntitlementsDto>('/api/subscriptions/entitlements');
  }

  plans() {
    return this.http.get<{ plans: PlanInfo[]; configured: boolean }>('/api/subscriptions/plans');
  }

  cancelSubscription(subscriptionId?: string) {
    return this.http.post('/api/subscriptions/me/cancel', { subscriptionId });
  }

  checkout(planKey: string) {
    return this.http.post<{ url: string; mode: string }>('/api/payments/checkout', { planKey });
  }

  devActivate(planKey: string) {
    return this.http.post('/api/payments/dev-activate', { planKey });
  }

  analyticsQueue() {
    return this.http.get<{ video: number; text: number; online: number }>('/api/analytics/queue');
  }

  myStats() {
    return this.http.get<{ matches: number; messages: number; reportsFiled: number; reportsReceived: number }>('/api/analytics/me');
  }

  notifications() {
    return this.http.get<
      { id: string; kind: string; title: string; body: string; readAt: string | null; createdAt: string }[]
    >('/api/notifications');
  }

  markNotificationRead(id: string) {
    return this.http.post(`/api/notifications/${id}/read`, {});
  }

  rateMatch(matchId: string, score: number) {
    return this.http.post<{ ok: true }>('/api/ratings', { matchId, score });
  }

  myRating(matchId: string) {
    return this.http.get<{ score: number | null }>(`/api/ratings/match/${matchId}`);
  }

  myKarma() {
    return this.http.get<KarmaDto>('/api/ratings/karma/me');
  }

  // ---------- credit products ----------
  creditProducts() {
    return this.http.get<{ products: CreditProductDto[] }>('/api/payments/credit-products');
  }

  buyCredits(productKey: string, idempotencyKey: string) {
    return this.http.post<{ url: string; mode: string }>('/api/payments/buy-credits', {
      productKey,
      idempotencyKey,
    });
  }

  // ---------- geo / advanced filters ----------
  getGeo() {
    return this.http.get<GeoLocationDto>('/api/profiles/geo');
  }

  updateGeo(dto: UpdateGeoDto) {
    return this.http.post<{ ok: true }>('/api/profiles/geo', dto);
  }

  // ---------- identity verification ----------
  submitVerification(provider: string, selfieUrl?: string, idDocUrl?: string) {
    return this.http.post<VerificationDto>('/api/verifications/submit', { provider, selfieUrl, idDocUrl });
  }

  myVerification() {
    return this.http.get<{ status: string | null; provider: string | null; badge: BadgeDto | null }>('/api/verifications/me');
  }
}
