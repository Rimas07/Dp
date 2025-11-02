import { Injectable, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
    /**
     * ✅ НЕ переопределяем handleRequest - пусть базовый класс делает свою работу
     * Просто логируем когда лимит превышен
     */
    protected async throwThrottlingException(context: ExecutionContext): Promise<void> {
        const request = context.switchToHttp().getRequest();
        const ip = request.ip || request.connection.remoteAddress;
        const path = request.originalUrl || request.url;

        // 🔍 Логирование
        console.log('\n🚫 ════════════════════════════════════════');
        console.log('   RATE LIMIT EXCEEDED!');
        console.log('════════════════════════════════════════');
        console.log(`   IP: ${ip}`);
        console.log(`   Path: ${path}`);
        console.log(`   Time: ${new Date().toISOString()}`);
        console.log('════════════════════════════════════════\n');

        throw new HttpException({
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests from this IP, please try again later',
            error: 'Too Many Requests',
            details: {
                ip: ip,
                path: path,
                retryAfter: '1 second'
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

        console.log('\n🔐 ════════════════════════════════════════');
        console.log('   LOGIN RATE LIMIT EXCEEDED!');
        console.log('════════════════════════════════════════');
        console.log(`   Email: ${email}`);
        console.log(`   Time: ${new Date().toISOString()}`);
        console.log('════════════════════════════════════════\n');

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