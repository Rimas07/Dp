import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class TenantConnectionService {
    constructor(@InjectConnection() private readonly connection: Connection) { }

    //Return the corresponding tenant database connection
    private getTenantConnection(tenantId: string): Connection {
        const tenantDbName = `tenant_${tenantId}`;
        return this.connection.useDb(tenantDbName);
    }

    async getTenantModel({ name, schema }, tenantId: string) {
        const tenantConnection = this.getTenantConnection(tenantId);
        return tenantConnection.model(name, schema);
    }
}
/* import { InjectConnection } from '@nestjs/mongoose';
Что делает: Импортирует декоратор для инъекции основного подключения к MongoDB. Зачем нужно: Получить главное подключение, от которого можно создать подключения к отдельным базам данных tenant'ов.
Строка 11
constructor(@InjectConnection() private readonly connection: Connection) { }
Что делает: Инжектирует главное подключение к MongoDB. Зачем нужно: Это подключение к MongoDB серверу. Через него можно переключаться между разными базами данных. Что будет без этого: Не получится создавать подключения к БД отдельных tenant'ов.
Строки 14-17
private getTenantConnection(tenantId: string): Connection {
    const tenantDbName = `tenant_${tenantId}`;
    return this.connection.useDb(tenantDbName);
}
Что делает: Возвращает подключение к базе данных конкретного tenant'а. Построчно:
private - метод доступен только внутри класса
tenantId: string - ID компании (например, "abc123")
const tenantDbName = tenant_${tenantId}`` - создает имя БД (например, "tenant_abc123")
this.connection.useDb(tenantDbName) - переключается на БД tenant'а
Зачем нужно: В MongoDB можно иметь много баз данных на одном сервере. Этот метод динамически переключается на нужную БД в зависимости от tenant'а. Архитектура БД:
MongoDB Server
├── tenant_abc123 (компания 1)
│   ├── secrets
│   ├── patients
│   └── ...
├── tenant_xyz789 (компания 2)
│   ├── secrets
│   ├── patients
│   └── ...
└── main_db (общие данные)
    ├── tenants
    └── users
Что будет без этого: Все компании использовали бы одну БД, данные смешались бы — нарушение изоляции!
Строки 19-22
async getTenantModel({ name, schema }, tenantId: string) {
    const tenantConnection = this.getTenantConnection(tenantId);
    return tenantConnection.model(name, schema);
}
Что делает: Возвращает Mongoose модель для конкретного tenant'а. Построчно:
{ name, schema } - деструктуризация объекта (принимает имя модели и схему)
const tenantConnection = this.getTenantConnection(tenantId) - получает подключение к БД tenant'а
tenantConnection.model(name, schema) - создает/получает модель в контексте БД tenant'а
Зачем нужно: Позволяет работать с коллекциями в БД конкретного tenant'а. Например:
// Получить модель Secrets для компании abc123
const SecretsModel = await getTenantModel(
  { name: 'Secrets', schema: SecretsSchema },
  'abc123'
);
// Теперь SecretsModel работает с коллекцией secrets в БД tenant_abc123
Что будет без этого: Не получится создавать модели в контексте отдельных tenant БД.*/