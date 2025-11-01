import { Injectable, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
    protected async throwThrottlingException(context: ExecutionContext): Promise<void> {
        const request = context.switchToHttp().getRequest();
        const ip = request.ip || request.connection.remoteAddress;
        const path = request.originalUrl || request.url;

        throw new HttpException({
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests from this IP, please try again later',
            error: 'Too Many Requests',
            details: {
                ip: ip,
                path: path,
                retryAfter: '60 seconds'
            }
        }, HttpStatus.TOO_MANY_REQUESTS);
    }
}

// Специальный guard для логина с более строгими лимитами
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
    protected async getTracker(req: Record<string, any>): Promise<string> {
        // Трекинг по IP + email для защиты конкретных аккаунтов
        const ip = req.ip || req.connection.remoteAddress;
        const email = req.body?.email || 'unknown';
        return `${ip}-${email}`;
    }

    protected async throwThrottlingException(context: ExecutionContext): Promise<void> {
        const request = context.switchToHttp().getRequest();
        const email = request.body?.email || 'unknown';

        throw new HttpException({
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `Too many login attempts for ${email}. Account temporarily locked.`,
            error: 'Account Temporarily Locked',
            details: {
                email: email,
                lockDuration: '15 minutes',
                attemptsBeforeLock: 5,
                suggestion: 'Please try again later or reset your password'
            }
        }, HttpStatus.TOO_MANY_REQUESTS);
    }
}