const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const db = new sqlite3.Database('./database.db');
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, email TEXT UNIQUE, password TEXT, role TEXT
  )`);
  
  // Employees table
  db.run(`CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, email TEXT UNIQUE, department TEXT, position TEXT, salary REAL, hire_date TEXT,
    phone TEXT, dob TEXT, address TEXT
  )`);
  
  // Attendance table
  db.run(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER, date TEXT, status TEXT, check_in TEXT, check_out TEXT,
    FOREIGN KEY(employee_id) REFERENCES employees(id)
  )`);
  
  // Payroll table
  db.run(`CREATE TABLE IF NOT EXISTS payroll (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER, month INTEGER, year INTEGER, basic_salary REAL, deductions REAL, net_salary REAL, payment_date TEXT,
    FOREIGN KEY(employee_id) REFERENCES employees(id)
  )`);
  
  // Leaves table
  db.run(`CREATE TABLE IF NOT EXISTS leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER, leave_type TEXT, start_date TEXT, end_date TEXT, status TEXT, reason TEXT,
    FOREIGN KEY(employee_id) REFERENCES employees(id)
  )`);
  
  // Insert default users if not exist
  const exists = `SELECT count(*) as c FROM users WHERE email='admin@payroll.com'`;
  db.get(exists, (err,row)=>{ if(row.c===0){
    bcrypt.hash('admin123',10,(e,h)=>db.run(`INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)`,
      ['Admin','admin@payroll.com',h,'admin']));
    bcrypt.hash('user123',10,(e,h)=>db.run(`INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)`,
      ['User','user@payroll.com',h,'user']));
  }});
});

app.post('/api/signup', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)`, [name, email, hash, 'user'], function(err) {
      if (err) return res.status(400).json({ error: 'Email already exists' });
      res.json({ ok: true });
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password, userType } = req.body;
  db.get(`SELECT * FROM users WHERE email=? AND role=?`, [email, userType], async (err, row) => {
    if (err || !row) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, row.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ ok: true, user: { name: row.name, email: row.email, role: row.role } });
  });
});

// ==================== EMPLOYEES API ====================
app.get('/api/employees', (req, res) => {
  db.all(`SELECT * FROM employees`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.post('/api/employees', (req, res) => {
  const { name, email, department, position, salary, hire_date, phone, dob, address } = req.body;
  db.run(`INSERT INTO employees(name,email,department,position,salary,hire_date,phone,dob,address) VALUES(?,?,?,?,?,?,?,?,?)`,
    [name, email, department, position, salary, hire_date, phone, dob, address], function(err) {
      if (err) return res.status(400).json({ error: 'Error adding employee' });
      res.json({ id: this.lastID });
    });
});

app.delete('/api/employees/:id', (req, res) => {
  db.run(`DELETE FROM employees WHERE id=?`, [req.params.id], function(err) {
    if (err) return res.status(400).json({ error: 'Error deleting employee' });
    res.json({ ok: true });
  });
});

// ==================== ATTENDANCE API ====================
app.get('/api/attendance', (req, res) => {
  db.all(`SELECT a.*, e.name FROM attendance a JOIN employees e ON a.employee_id = e.id`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.post('/api/attendance', (req, res) => {
  const { employee_id, date, status, check_in, check_out } = req.body;
  db.run(`INSERT INTO attendance(employee_id,date,status,check_in,check_out) VALUES(?,?,?,?,?)`,
    [employee_id, date, status, check_in, check_out], function(err) {
      if (err) return res.status(400).json({ error: 'Error marking attendance' });
      res.json({ id: this.lastID });
    });
});

// ==================== PAYROLL API ====================
app.get('/api/payroll', (req, res) => {
  db.all(`SELECT p.*, e.name FROM payroll p JOIN employees e ON p.employee_id = e.id`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.post('/api/payroll', (req, res) => {
  const { employee_id, month, year, basic_salary, deductions, net_salary, payment_date } = req.body;
  db.run(`INSERT INTO payroll(employee_id,month,year,basic_salary,deductions,net_salary,payment_date) VALUES(?,?,?,?,?,?,?)`,
    [employee_id, month, year, basic_salary, deductions, net_salary, payment_date], function(err) {
      if (err) return res.status(400).json({ error: 'Error adding payroll' });
      res.json({ id: this.lastID });
    });
});

// ==================== LEAVES API ====================
app.get('/api/leaves', (req, res) => {
  db.all(`SELECT l.*, e.name FROM leaves l JOIN employees e ON l.employee_id = e.id`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.post('/api/leaves', (req, res) => {
  const { employee_id, leave_type, start_date, end_date, reason } = req.body;
  db.run(`INSERT INTO leaves(employee_id,leave_type,start_date,end_date,status,reason) VALUES(?,?,?,?,?,?)`,
    [employee_id, leave_type, start_date, end_date, 'pending', reason], function(err) {
      if (err) return res.status(400).json({ error: 'Error submitting leave' });
      res.json({ id: this.lastID });
    });
});

app.put('/api/leaves/:id', (req, res) => {
  const { status } = req.body;
  db.run(`UPDATE leaves SET status=? WHERE id=?`, [status, req.params.id], function(err) {
    if (err) return res.status(400).json({ error: 'Error updating leave' });
    res.json({ ok: true });
  });
});

app.listen(3000,()=>console.log('Listening 3000'));