import * as bcrypt from 'bcrypt';

describe('Password hashing', () => {
    it('should hash password correctly', async () => {
        const password = 'test123';
        const hashed = await bcrypt.hash(password, 10);

        expect(hashed).toBeDefined();
        expect(hashed).not.toBe(password); // Хеш не равен оригиналу

        // Проверяем что можем сравнить
        const isMatch = await bcrypt.compare(password, hashed);
        expect(isMatch).toBe(true);
    });

    it('should not match wrong password', async () => {
        const password = 'test123';
        const wrongPassword = 'wrong456';
        const hashed = await bcrypt.hash(password, 10);

        const isMatch = await bcrypt.compare(wrongPassword, hashed);
        expect(isMatch).toBe(false);
    });
});