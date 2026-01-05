
import Cryptr from "cryptr";

export function encrypt(data: string, encryptionKey: string): string {
    const cryptr = new Cryptr(encryptionKey);
    return cryptr.encrypt(data)
}


//Cryptr — an encryption library that uses AES-256.
//data: string - data to be encrypted (JWT secret)
//encryptionKey: string - master encryption key, taken from the config
//new Cryptr(encryptionKey) - creates an encryptor instance with the key
//cryptr.encrypt(data) - encrypts data, returns the encrypted string
// total: Protects JWT secrets in the database. If something happens, an attacker won't be able to decrypt them without the master key