// 1) bcrypt adds a random salt each time, so the same password hashes differently while still verifying.
// 2) You cannot derive the original password from a bcrypt hash in any practical way.
// 3) Slow hashing makes brute-force attacks expensive because each guess takes noticeable work.
const bcrypt = require('bcryptjs');

async function demo() {
    const hash1 = await bcrypt.hash('password123', 12);
    const hash2 = await bcrypt.hash('password123', 12);
    console.log('Hash 1:', hash1);
    console.log('Hash 2:', hash2);

    console.log('Right password, hash 1:', await bcrypt.compare('password123', hash1));
    console.log('Right password, hash 2:', await bcrypt.compare('password123', hash2));
    console.log('Wrong password, hash 1:', await bcrypt.compare('password124', hash1));
}

demo();
