import { Module } from '@nestjs/common';

// Preferences live in ProfilesController (/profiles/preferences).
// This module exists to keep requested module boundaries visible.
@Module({})
export class PreferencesModule {}
