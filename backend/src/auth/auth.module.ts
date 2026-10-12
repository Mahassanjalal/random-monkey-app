import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtVerifier } from './jwt.strategy';
import { JwtAuthGuard } from './jwt.guard';

@Global()
@Module({
  imports: [
    JwtModule.register({
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtVerifier, JwtAuthGuard],
  exports: [AuthService, JwtVerifier, JwtAuthGuard],
})
export class AuthModule {}
