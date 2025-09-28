const mongoose = require('mongoose');

// Схемы
const tenantSchema = new mongoose.Schema({
    companyName: { type: String, required: true },
    tenantId: { type: String, required: true }
});

const patientSchema = new mongoose.Schema({
    name: { type: String, required: true },
    surname: { type: String, required: true },
    age: { type: String, required: true }
});

async function checkPatients() {
    try {
        // Подключение к MongoDB
        await mongoose.connect('mongodb://localhost:27017/defaultdb');
        console.log('🔌 Подключено к MongoDB');

        // Получаем все тенанты
        const Tenant = mongoose.model('Tenant', tenantSchema);
        const tenants = await Tenant.find();
        console.log(`📋 Найдено тенантов: ${tenants.length}`);

        let totalPatients = 0;

        for (const tenant of tenants) {
            console.log(`\n🏢 Тенант: ${tenant.companyName} (ID: ${tenant.tenantId})`);
            
            try {
                // Подключаемся к базе данных тенанта
                const tenantDb = mongoose.connection.useDb(`tenant_${tenant.tenantId}`);
                const Patient = tenantDb.model('Patient', patientSchema);
                
                // Подсчитываем пациентов
                const patientCount = await Patient.countDocuments();
                console.log(`   👥 Пациентов: ${patientCount}`);
                
                if (patientCount > 0) {
                    // Показываем первых 3 пациентов
                    const patients = await Patient.find().limit(3);
                    patients.forEach(patient => {
                        console.log(`   - ${patient.name} ${patient.surname}, возраст: ${patient.age}`);
                    });
                }
                
                totalPatients += patientCount;
            } catch (error) {
                console.log(`   ❌ Ошибка: ${error.message}`);
            }
        }

        console.log(`\n📊 Общее количество пациентов: ${totalPatients}`);

    } catch (error) {
        console.error('❌ Ошибка:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Отключено от MongoDB');
    }
}

checkPatients();

