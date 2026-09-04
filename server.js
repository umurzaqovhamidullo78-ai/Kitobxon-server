const path = require("path");
const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "30mb" }));
app.use(express.static(__dirname));

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

// ===============================
// BOOKS
// ===============================

app.get("/api/books", (req, res) => {
    const books = db.prepare(`
        SELECT
            books.*,
            libraries.name AS library_name
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
app.post("/api/books", (req, res) => {
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
app.put("/api/books/:id", (req, res) => {
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
app.delete("/api/books/:id", (req, res) => {
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
        role
    } = req.body;

    if (!name || !phone || !password) {
        return res.status(400).json({
            success: false,
            message: "Ism, telefon va parol kerak"
        });
    }

    try {
        const result = db.prepare(`
            INSERT INTO users
            (name, phone, password, role)
            VALUES (?, ?, ?, ?)
        `).run(
            name,
            phone,
            password,
            role || "reader"
        );

        res.json({
            success: true,
            id: result.lastInsertRowid
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: "Bu telefon raqami allaqachon ro‘yxatdan o‘tgan"
        });
    }
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

app.post("/api/news", (req, res) => {
    const {
        title,
        text,
        image
    } = req.body;

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

// ===============================
// PDF FILES
// ===============================

app.get("/api/books/:id/pdf", (req, res) => {
    const book = db.prepare(`
        SELECT id, title
        FROM books
        WHERE id = ?
    `).get(req.params.id);

    if (!book) {
        return res.status(404).json({
            success: false,
            message: "Kitob topilmadi"
        });
    }

    const pdfPath = path.join(__dirname, "pdf", `${book.id}.pdf`);

    res.sendFile(pdfPath, (err) => {
        if (err && !res.headersSent) {
            res.status(404).json({
                success: false,
                message: "Bu kitob uchun PDF fayl mavjud emas"
            });
        }
    });
});

// ===============================
// SERVER
// ===============================

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Kitobxon server ${PORT}-portda ishga tushdi`);
});
