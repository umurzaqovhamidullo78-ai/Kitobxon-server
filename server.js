const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const multer = require("multer");
const fs = require("fs");

const uploadDir = path.join(__dirname, "uploads", "news");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
    dest: uploadDir,
    limits: { fileSize: 10 * 1024 * 1024 }
});


function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
    const parts = String(stored || "").split("$");

    if (parts.length !== 3 || parts[0] !== "scrypt") {
        return false;
    }

    const salt = parts[1];
    const storedHash = parts[2];

    const hash = crypto.scryptSync(password, salt, 64).toString("hex");

    return crypto.timingSafeEqual(
        Buffer.from(hash, "hex"),
        Buffer.from(storedHash, "hex")
    );
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "30mb" }));
app.use(express.static(__dirname));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const db = new Database("kitobxon.db");

// ===============================
// DATABASE
// ===============================

db.exec(`
CREATE TABLE IF NOT EXISTS libraries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    region TEXT,
    district TEXT,
    address TEXT,
    phone TEXT,
    work_time TEXT
);

CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    genre TEXT,
    isbn TEXT,
    year INTEGER,
    library_id INTEGER,
    address TEXT,
    inventory_number TEXT,
    copies INTEGER DEFAULT 1,
    available INTEGER DEFAULT 1,
    cover TEXT,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(library_id) REFERENCES libraries(id)
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'reader',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(book_id) REFERENCES books(id)
);

CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    UNIQUE(user_id, book_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(book_id) REFERENCES books(id)
);

CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    text TEXT NOT NULL,
    image TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// ===============================
// AUTH DATABASE MIGRATION
// ===============================

const userColumns = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);

if (!userColumns.includes("library_id")) {
    db.exec("ALTER TABLE users ADD COLUMN library_id INTEGER");
}

if (!userColumns.includes("approved")) {
    db.exec("ALTER TABLE users ADD COLUMN approved INTEGER NOT NULL DEFAULT 0");
}

if (!userColumns.includes("approved_by")) {
    db.exec("ALTER TABLE users ADD COLUMN approved_by INTEGER");
}

if (!userColumns.includes("approved_at")) {
    db.exec("ALTER TABLE users ADD COLUMN approved_at TEXT");
}

db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
`);

// ===============================
// STARTER LIBRARY
// ===============================

const libraryCount = db
    .prepare("SELECT COUNT(*) AS count FROM libraries")
    .get();

if (libraryCount.count === 0) {
    db.prepare(`
        INSERT INTO libraries
        (name, region, district, address, phone, work_time)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        "Namangan tumani Axborot-kutubxona markazi",
        "Namangan viloyati",
        "Namangan tumani",
        "Toshbuloq",
        "",
        "09:00 - 18:00"
    );
}

// ===============================
// HOME
// ===============================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "Kitobxon_app.html"));
});

// ===============================
// LIBRARIES
// ===============================

app.get("/api/libraries", (req, res) => {
    const libraries = db
        .prepare("SELECT * FROM libraries ORDER BY id DESC")
        .all();

    res.json({
        success: true,
        data: libraries
    });
});

app.post("/api/libraries", (req, res) => {
    const {
        name,
        region,
        district,
        address,
        phone,
        work_time
    } = req.body;

    if (!name) {
        return res.status(400).json({
            success: false,
            message: "Kutubxona nomi kerak"
        });
    }

    const result = db.prepare(`
        INSERT INTO libraries
        (name, region, district, address, phone, work_time)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        name,
        region || "",
        district || "",
        address || "",
        phone || "",
        work_time || ""
    );

    res.json({
        success: true,
        id: result.lastInsertRowid
    });
});


app.put("/api/libraries/:id", (req, res) => {

    const { id } = req.params;

    const {
        name,
        region,
        district,
        address,
        phone,
        work_time
    } = req.body;

    if (!name) {
        return res.status(400).json({
            success: false,
            message: "Kutubxona nomi kerak"
        });
    }

    const result = db.prepare(`
        UPDATE libraries
        SET
            name = ?,
            region = ?,
            district = ?,
            address = ?,
            phone = ?,
            work_time = ?
        WHERE id = ?
    `).run(
        name,
        region || "",
        district || "",
        address || "",
        phone || "",
        work_time || "",
        id
    );

    if (result.changes === 0) {
        return res.status(404).json({
            success: false,
            message: "Kutubxona topilmadi"
        });
    }

    res.json({
        success: true,
        message: "Kutubxona yangilandi"
    });
});


app.delete("/api/libraries/:id", (req, res) => {

    const { id } = req.params;

    const result = db
        .prepare("DELETE FROM libraries WHERE id = ?")
        .run(id);

    if (result.changes === 0) {
        return res.status(404).json({
            success: false,
            message: "Kutubxona topilmadi"
        });
    }

    res.json({
        success: true,
        message: "Kutubxona o‘chirildi"
    });
});

// ===============================
// BOOKS
// ===============================

app.get("/api/books", (req, res) => {
    const books = db.prepare(`
        SELECT
            books.id,
            books.title,
            books.author,
            books.genre,
            books.isbn,
            books.year,
            books.library_id,
            books.address,
            books.inventory_number,
            books.copies,
            books.available,
            books.description,
            books.ebook_type,
            books.created_at,
            libraries.name AS library_name,
            CASE
                WHEN books.cover IS NOT NULL AND books.cover != ''
                THEN '/api/books/' || books.id || '/cover'
                ELSE ''
            END AS cover_url
        FROM books
        LEFT JOIN libraries
            ON books.library_id = libraries.id
        ORDER BY books.id DESC
    `).all();

    res.json({
        success: true,
        data: books
    });
});

// SEARCH
app.get("/api/books/search", (req, res) => {
    const q = req.query.q || "";

    const books = db.prepare(`
        SELECT
            books.*,
            libraries.name AS library_name
        FROM books
        LEFT JOIN libraries
            ON books.library_id = libraries.id
        WHERE
            books.title LIKE ?
            OR books.author LIKE ?
            OR books.genre LIKE ?
            OR books.isbn LIKE ?
        ORDER BY books.id DESC
    `).all(
        `%${q}%`,
        `%${q}%`,
        `%${q}%`,
        `%${q}%`
    );

    res.json({
        success: true,
        data: books
    });
});

// GET ONE BOOK
app.get("/api/books/:id", (req, res) => {
    const book = db.prepare(`
        SELECT
            books.*,
            libraries.name AS library_name,
            libraries.address AS library_address
        FROM books
        LEFT JOIN libraries
            ON books.library_id = libraries.id
        WHERE books.id = ?
    `).get(req.params.id);

    if (!book) {
        return res.status(404).json({
            success: false,
            message: "Kitob topilmadi"
        });
    }

    res.json({
        success: true,
        data: book
    });
});

// ADD BOOK
app.post("/api/books", requireAuth, requireLibraryPermission, (req, res) => {
    const {
        title,
        author,
        genre,
        isbn,
        year,
        library_id,
        address,
        inventory_number,
        copies,
        cover,
        description,
        ebook_file,
        ebook_type
    } = req.body;

    if (!title || !author) {
        return res.status(400).json({
            success: false,
            message: "Kitob nomi va muallif kiritilishi shart"
        });
    }

    const copyCount = Number(copies) || 1;

    const result = db.prepare(`
        INSERT INTO books
        (
            title,
            author,
            genre,
            isbn,
            year,
            library_id,
            address,
            inventory_number,
            copies,
            available,
            cover,
            description,
            ebook_file,
            ebook_type
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        title,
        author,
        genre || "",
        isbn || "",
        year || null,
        library_id || null,
        address || "",
        inventory_number || "",
        copyCount,
        copyCount,
        cover || "",
        description || "",
        ebook_file || "",
        ebook_type || ""
    );

    res.json({
        success: true,
        message: "Kitob muvaffaqiyatli qo‘shildi",
        id: result.lastInsertRowid
    });
});

// UPDATE BOOK
app.put("/api/books/:id", requireAuth, requireLibraryPermission, (req, res) => {
    const {
        title,
        author,
        genre,
        isbn,
        year,
        library_id,
        address,
        inventory_number,
        copies,
        available,
        cover,
        description
    } = req.body;

    const result = db.prepare(`
        UPDATE books
        SET
            title = ?,
            author = ?,
            genre = ?,
            isbn = ?,
            year = ?,
            library_id = ?,
            address = ?,
            inventory_number = ?,
            copies = ?,
            available = ?,
            cover = ?,
            description = ?
        WHERE id = ?
    `).run(
        title,
        author,
        genre || "",
        isbn || "",
        year || null,
        library_id || null,
        address || "",
        inventory_number || "",
        Number(copies) || 1,
        Number(available) || 0,
        cover || "",
        description || "",
        req.params.id
    );

    res.json({
        success: result.changes > 0,
        message: result.changes
            ? "Kitob yangilandi"
            : "Kitob topilmadi"
    });
});

// DELETE BOOK
app.delete("/api/books/:id", requireAuth, requireLibraryPermission, (req, res) => {
    const result = db
        .prepare("DELETE FROM books WHERE id = ?")
        .run(req.params.id);

    res.json({
        success: result.changes > 0,
        message: result.changes
            ? "Kitob o‘chirildi"
            : "Kitob topilmadi"
    });
});

// ===============================
// USERS
// ===============================

app.post("/api/users", (req, res) => {
    const {
        name,
        phone,
        password,
        library_id
    } = req.body;

    if (!name || !phone || !password) {
        return res.status(400).json({
            success: false,
            message: "Ism, telefon va parol kerak"
        });
    }

    try {
        const passwordHash = hashPassword(password);

        const result = db.prepare(`
            INSERT INTO users
            (name, phone, password, role, library_id, approved)
            VALUES (?, ?, ?, 'reader', ?, 1)
        `).run(
            name.trim(),
            phone.trim(),
            passwordHash,
            library_id || null
        );

        res.json({
            success: true,
            id: result.lastInsertRowid,
            role: "reader",
            approved: 1
        });

    } catch (error) {
        console.error("Foydalanuvchi ro‘yxatdan o‘tishda xato:", error);

        res.status(400).json({
            success: false,
            message: "Bu telefon raqami allaqachon ro‘yxatdan o‘tgan"
        });
    }
});

// ===============================
// AUTH: LOGIN / SESSION
// ===============================

function getTokenFromRequest(req) {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
        return null;
    }

    return header.slice(7).trim();
}

function getCurrentUser(req) {
    const token = getTokenFromRequest(req);

    if (!token) return null;

    const tokenHash = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

    const session = db.prepare(`
        SELECT
            sessions.id AS session_id,
            sessions.expires_at,
            users.id,
            users.name,
            users.phone,
            users.role,
            users.library_id,
            users.approved
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ?
          AND sessions.expires_at > datetime('now')
    `).get(tokenHash);

    return session || null;
}

function requireAuth(req, res, next) {
    const user = getCurrentUser(req);

    if (!user) {
        return res.status(401).json({
            success: false,
            message: "Avval tizimga kiring"
        });
    }

    req.user = user;
    next();
}

app.post("/api/login", (req, res) => {
    const { phone, password } = req.body;

    if (!phone || !password) {
        return res.status(400).json({
            success: false,
            message: "Telefon va parol kerak"
        });
    }

    const user = db.prepare(`
        SELECT *
        FROM users
        WHERE phone = ?
    `).get(phone.trim());

    if (!user || !verifyPassword(password, user.password)) {
        return res.status(401).json({
            success: false,
            message: "Telefon yoki parol noto‘g‘ri"
        });
    }

    const token = crypto.randomBytes(32).toString("hex");

    const tokenHash = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

    const expiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    db.prepare(`
        INSERT INTO sessions
        (user_id, token_hash, expires_at)
        VALUES (?, ?, ?)
    `).run(
        user.id,
        tokenHash,
        expiresAt
    );

    res.json({
        success: true,
        token,
        user: {
            id: user.id,
            name: user.name,
            phone: user.phone,
            role: user.role,
            library_id: user.library_id,
            approved: !!user.approved
        }
    });
});

app.get("/api/me", requireAuth, (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user.id,
            name: req.user.name,
            phone: req.user.phone,
            role: req.user.role,
            library_id: req.user.library_id,
            approved: !!req.user.approved
        }
    });
});

app.post("/api/logout", requireAuth, (req, res) => {
    const token = getTokenFromRequest(req);

    const tokenHash = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

    db.prepare(`
        DELETE FROM sessions
        WHERE token_hash = ?
    `).run(tokenHash);

    res.json({
        success: true,
        message: "Tizimdan chiqildi"
    });
});

// ===============================
// RESERVATIONS
// ===============================


app.post("/api/favorites", (req, res) => {
    const {
        user_id,
        book_id
    } = req.body;

    try {
        db.prepare(`
            INSERT INTO favorites
            (user_id, book_id)
            VALUES (?, ?)
        `).run(user_id, book_id);

        res.json({
            success: true,
            message: "Tanlanganlarga qo‘shildi"
        });
    } catch {
        res.json({
            success: true,
            message: "Kitob allaqachon tanlangan"
        });
    }
});

app.get("/api/users/:userId/favorites", (req, res) => {
    const favorites = db.prepare(`
        SELECT
            books.*
        FROM favorites
        JOIN books
            ON favorites.book_id = books.id
        WHERE favorites.user_id = ?
        ORDER BY favorites.id DESC
    `).all(req.params.userId);

    res.json({
        success: true,
        data: favorites
    });
});

// ===============================
// NEWS
// ===============================

app.get("/api/news", (req, res) => {
    const news = db.prepare(`
        SELECT *
        FROM news
        ORDER BY id DESC
    `).all();

    res.json({
        success: true,
        data: news
    });
});

app.post("/api/news", upload.single("image"), (req, res) => {
    const {
        title,
        text
    } = req.body;

    const image = req.file
        ? "/uploads/news/" + req.file.filename
        : "";

    if (!title || !text) {
        return res.status(400).json({
            success: false,
            message: "Yangilik nomi va matni kerak"
        });
    }

    const result = db.prepare(`
        INSERT INTO news
        (title, text, image)
        VALUES (?, ?, ?)
    `).run(
        title,
        text,
        image || ""
    );

    res.json({
        success: true,
        id: result.lastInsertRowid
    });
});

app.delete("/api/news/:id", (req, res) => {
    const id = Number(req.params.id);
    const news = db.prepare("SELECT image FROM news WHERE id = ?").get(id);

    if (!news) {
        return res.status(404).json({
            success: false,
            message: "Yangilik topilmadi"
        });
    }

    if (news.image && news.image.startsWith("/uploads/news/")) {
        const filePath = path.join(__dirname, news.image.replace(/^\//, ""));
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    db.prepare("DELETE FROM news WHERE id = ?").run(id);

    res.json({
        success: true,
        message: "Yangilik o‘chirildi"
    });
});

// ===============================
// BOOK COVER
app.get("/api/books/:id/cover", (req, res) => {
    const book = db.prepare(`
        SELECT cover
        FROM books
        WHERE id = ?
    `).get(req.params.id);

    if (!book || !book.cover) {
        return res.status(404).json({
            success: false,
            message: "Bu kitob uchun muqova mavjud emas"
        });
    }

    const match = book.cover.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

    if (!match) {
        return res.status(404).json({
            success: false,
            message: "Muqova formati noto‘g‘ri"
        });
    }

    const mime = match[1];
    const buffer = Buffer.from(match[2], "base64");

    res.set("Content-Type", mime);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(buffer);
});

// PDF FILES
// ===============================

const pdfCache = new Map();

app.get("/api/books/:id/pdf", (req, res) => {
    const book = db.prepare(`
        SELECT id, title, ebook_file, ebook_type
        FROM books
        WHERE id = ?
    `).get(req.params.id);

    if (!book) {
        return res.status(404).json({
            success: false,
            message: "Kitob topilmadi"
        });
    }

    if (book.ebook_type !== "pdf" || !book.ebook_file) {
        return res.status(404).json({
            success: false,
            message: "Bu kitob uchun PDF fayl mavjud emas"
        });
    }

    const match = book.ebook_file.match(/^data:application\/pdf;base64,(.+)$/s);

    if (!match) {
        return res.status(400).json({
            success: false,
            message: "PDF ma'lumoti noto'g'ri formatda"
        });
    }

    try {
        let pdfBuffer = pdfCache.get(book.id);

        if (!pdfBuffer) {
            pdfBuffer = Buffer.from(match[1], "base64");
            pdfCache.set(book.id, pdfBuffer);
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Length", pdfBuffer.length);
        res.setHeader("Content-Disposition", `inline; filename="book-${book.id}.pdf"`);
        res.setHeader("Cache-Control", "public, max-age=3600");

        res.send(pdfBuffer);
    } catch (error) {
        console.error("PDF decode xatosi:", error);

        res.status(500).json({
            success: false,
            message: "PDF faylni ochishda xatolik"
        });
    }
});

// ADMIN: BARCHA FOYDALANUVCHILAR
// ===============================

app.get("/api/admin/users", requireAuth, (req, res) => {
    if (!["district_admin", "region_admin", "republic_admin"].includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: "Sizda bu amal uchun ruxsat yo‘q"
        });
    }

    const users = db.prepare(`
        SELECT id, name, phone, role, created_at
        FROM users
        ORDER BY id DESC
    `).all();

    res.json({
        success: true,
        data: users
    });
});

// ===============================
// SERVER
// ===============================

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Kitobxon server ${PORT}-portda ishga tushdi`);
});

// ===============================

// ===============================

// ===============================
// ADMIN: OPERATOR YARATISH
// ===============================

app.post("/api/admin/operators", requireAuth, (req, res) => {
    if (!["district_admin", "region_admin", "republic_admin"].includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: "Sizda operator yaratish uchun ruxsat yo‘q"
        });
    }

    const { name, phone, password, library_id } = req.body;

    if (!name || !phone || !password) {
        return res.status(400).json({
            success: false,
            message: "Ism, telefon va parol kerak"
        });
    }

    try {
        const passwordHash = hashPassword(password);

        const result = db.prepare(`
            INSERT INTO users
            (name, phone, password, role, library_id, approved)
            VALUES (?, ?, ?, 'operator', ?, 0)
        `).run(
            name.trim(),
            phone.trim(),
            passwordHash,
            library_id || null
        );

        res.json({
            success: true,
            id: result.lastInsertRowid,
            role: "operator",
            approved: false,
            message: "Operator yaratildi. Administrator tasdig‘ini kutmoqda."
        });

    } catch (error) {
        console.error("Operator yaratishda xato:", error);

        res.status(400).json({
            success: false,
            message: "Bu telefon raqami allaqachon ro‘yxatdan o‘tgan"
        });
    }
});


// ===============================
// ADMIN: OPERATORNI TASDIQLASH
// ===============================

app.post("/api/admin/users/:id/approve", requireAuth, (req, res) => {
    if (!["district_admin", "region_admin", "republic_admin"].includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: "Sizda operatorni tasdiqlash uchun ruxsat yo‘q"
        });
    }

    const userId = Number(req.params.id);
    const libraryId = Number(req.body?.library_id);

    if (!userId || !libraryId) {
        return res.status(400).json({
            success: false,
            message: "Foydalanuvchi ID va kutubxona ID kerak"
        });
    }

    const targetUser = db.prepare(`
        SELECT id, name, phone, role, library_id, approved
        FROM users
        WHERE id = ?
    `).get(userId);

    if (!targetUser) {
        return res.status(404).json({
            success: false,
            message: "Foydalanuvchi topilmadi"
        });
    }

    if (targetUser.role !== "operator" && targetUser.role !== "admin") {
        return res.status(400).json({
            success: false,
            message: "Faqat operator yoki admin akkauntini tasdiqlash mumkin"
        });
    }

    const library = db.prepare(`
        SELECT id, name
        FROM libraries
        WHERE id = ?
    `).get(libraryId);

    if (!library) {
        return res.status(404).json({
            success: false,
            message: "Kutubxona topilmadi"
        });
    }

    db.prepare(`
        UPDATE users
        SET
            approved = 1,
            library_id = ?,
            approved_by = ?,
            approved_at = datetime('now')
        WHERE id = ?
    `).run(
        libraryId,
        req.user.id,
        userId
    );

    res.json({
        success: true,
        message: "Operator tasdiqlandi va kutubxonaga biriktirildi",
        user: {
            id: targetUser.id,
            name: targetUser.name,
            phone: targetUser.phone,
            role: targetUser.role,
            library_id: libraryId,
            library_name: library.name,
            approved: true,
            approved_by: req.user.id
        }
    });
});

// ADMIN: KUTILAYOTGAN OPERATORLAR
// ===============================

app.get("/api/admin/pending-users", requireAuth, (req, res) => {
    if (!["district_admin", "region_admin", "republic_admin"].includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: "Sizda bu amal uchun ruxsat yo‘q"
        });
    }

    const users = db.prepare(`
        SELECT
            id,
            name,
            phone,
            role,
            library_id,
            approved,
            created_at
        FROM users
        WHERE approved = 0
        ORDER BY id DESC
    `).all();

    res.json({
        success: true,
        data: users
    });
});

// PERMISSIONS
// ===============================

// ===============================
// PERMISSIONS
// ===============================

function requireLibraryPermission(req, res, next) {
    const user = req.user;

    if (!user) {
        return res.status(401).json({
            success: false,
            message: "Avval tizimga kiring"
        });
    }

    if (!user.approved) {
        return res.status(403).json({
            success: false,
            message: "Akkauntingiz hali administrator tomonidan tasdiqlanmagan"
        });
    }

    const allowedRoles = [
        "operator",
        "admin",
        "district_admin",
        "region_admin",
        "republic_admin"
    ];

    if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({
            success: false,
            message: "Sizda bu amal uchun ruxsat yo‘q"
        });
    }

    const targetLibraryId =
        req.body?.library_id ||
        req.params?.library_id ||
        req.params?.id && db.prepare(
            "SELECT library_id FROM books WHERE id = ?"
        ).get(req.params.id)?.library_id;

    if (!targetLibraryId) {
        return res.status(400).json({
            success: false,
            message: "Kutubxona aniqlanmadi"
        });
    }

    if (user.role === "operator" || user.role === "admin") {
        if (Number(user.library_id) !== Number(targetLibraryId)) {
            return res.status(403).json({
                success: false,
                message: "Siz faqat o‘zingizga biriktirilgan kutubxonani boshqara olasiz"
            });
        }
    }

    req.targetLibraryId = Number(targetLibraryId);
    next();
}
