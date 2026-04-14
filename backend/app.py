from flask import Flask, request, jsonify, send_from_directory, render_template, session, redirect, url_for
from dotenv import load_dotenv
import os, json, uuid, jwt, time, smtplib, ssl, secrets
import mysql.connector as mysql
from mysql.connector import Error
from flask_cors import CORS
import requests
from datetime import datetime, timedelta, timezone
from werkzeug.utils import secure_filename
from functools import wraps
import random
from xendit_service import XenditService
from email.mime.text import  MIMEText
from email.mime.multipart import MIMEMultipart

app = Flask(__name__, 
    static_folder='../static',
    static_url_path='/static',
    template_folder='../templates'
)

env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
if os.path.isfile(env_path):
    load_dotenv(env_path)

app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', "your-secret-key")
CORS(app)

XENDIT_SECRET_KEY = os.getenv("XENDIT_SECRET_KEY")
XENDIT_PUBLIC_KEY = os.getenv("XENDIT_PUBLIC_KEY")
XENDIT_WEBHOOK_TOKEN = os.getenv("XENDIT_WEBHOOK_TOKEN")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
SMTP_SERVER = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
SMTP_PORT = int(os.getenv('SMTP_PORT', 587))
EMAIL_ADDRESS = os.getenv('EMAIL_ADDRESS')
EMAIL_PASSWORD = os.getenv('EMAIL_PASSWORD')
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True').lower() == 'true'

# Default admin seeding config (DEV)
ADMIN_EMAIL = os.getenv('ADMIN_EMAIL', 'admin@example.com').strip().lower()
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'admin123')
ADMIN_NAME = os.getenv('ADMIN_NAME', 'Admin')

xendit = XenditService(
    secret_key=XENDIT_SECRET_KEY,
    public_key=XENDIT_PUBLIC_KEY
)


UPLOAD_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'static', 'uploads', 'products'))
DELIVERY_PROOF_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'static', 'uploads', 'delivery_proof'))

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
if not os.path.exists(DELIVERY_PROOF_FOLDER):
    os.makedirs(DELIVERY_PROOF_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['DELIVERY_PROOF_FOLDER'] = DELIVERY_PROOF_FOLDER

@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)

@app.route('/static/uploads/products/<path:filename>')
def serve_product_image(filename):
    return send_from_directory(os.path.join(app.static_folder, 'uploads', 'products'), filename)

@app.route('/static/uploads/delivery_proof/<path:filename>')
def serve_delivery_proof(filename):
    return send_from_directory(os.path.join(app.static_folder, 'uploads', 'delivery_proof'), filename)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def serve_index():
    return send_from_directory('../templates/Public', 'index.html')

@app.route('/forgot-password')
def serve_forgot_password():
    return send_from_directory('../templates/Authenticator', 'forgot-password.html')

@app.route('/reset-password')
def serve_reset_password():
    return send_from_directory('../templates/Authenticator', 'reset-password.html')

@app.route('/become-seller')
def serve_become_seller():
    return send_from_directory('../templates/Public', 'become-seller.html')

@app.route('/become-rider')
def serve_become_rider():
    return send_from_directory('../templates/Public', 'become-rider.html')


@app.route('/<path:filename>')
def serve_static_files(filename):
    if filename.startswith('templates/'):
        template_path = filename.replace('templates/', '', 1)
        return send_from_directory('../templates', template_path)
    elif filename.startswith('static/'):
        static_path = filename.replace('static/', '', 1)
        return send_from_directory('../static', static_path)
    else:
        if filename.endswith('.html'):
            return send_from_directory('../templates', filename)
        return send_from_directory('../static', filename)

def get_db_connection():
    try:
        connection = mysql.connect(
            host="127.0.0.1",
            user="root",
            password="",
            database="ecommerce"
        )
        return connection
    except Error as e:
        print(f"Error connecting to MySQL: {e}")
        return None
def init_database():
    connection = get_db_connection()
    if connection:
        cursor = connection.cursor()
        
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('buyer', 'seller', 'rider', 'admin') DEFAULT 'buyer',
                status ENUM('active', 'suspended', 'pending', 'rejected', 'approved', 'available', 'busy', 'offline') DEFAULT 'pending',
                phone VARCHAR(20),
                address TEXT,
                gender ENUM('male', 'female', 'other') NULL,
                id_document TEXT NULL,
                google_id VARCHAR(255) UNIQUE NULL,
                login_method ENUM('password','google') DEFAULT 'password',
                location_lat DECIMAL(10, 8) NULL,
                location_lng DECIMAL(11, 8) NULL,
                is_active TINYINT(1) DEFAULT 1,
                email_verified BOOLEAN DEFAULT FALSE,
                verification_code VARCHAR(6),
                verification_code_expires_at DATETIME,
                verification_attempts INT DEFAULT 0,
                last_login TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_email_verified (email_verified),
                INDEX idx_verification_code (verification_code)
            )
        """)

        # Ensure suffix and birthday columns exist even if table was created earlier by another entrypoint
        try:
            cursor.execute("SHOW COLUMNS FROM users LIKE 'suffix'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE users ADD COLUMN suffix VARCHAR(50) NULL AFTER name")
        except Exception as _:
            pass
        try:
            cursor.execute("SHOW COLUMNS FROM users LIKE 'birthday'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE users ADD COLUMN birthday DATE NULL AFTER gender")
        except Exception as _:
            pass
        
        # Ensure 'rejected' and 'approved' statuses are available in users table
        try:
            cursor.execute("SHOW COLUMNS FROM users WHERE Field = 'status'")
            status_col = cursor.fetchone()
            if status_col:
                # Check if 'rejected' and 'approved' are in the ENUM values
                enum_str = status_col[1] if isinstance(status_col, tuple) else status_col.get('Type', '')
                enum_upper = enum_str.upper()
                
                needs_update = False
                new_enum_values = ['active', 'suspended', 'pending', 'rejected', 'approved', 'available', 'busy', 'offline']
                
                # Check which values are missing
                missing_values = []
                if 'rejected' not in enum_upper:
                    missing_values.append('rejected')
                    needs_update = True
                
                if 'approved' not in enum_upper:
                    missing_values.append('approved')
                    needs_update = True
                
                # If some values exist but not all, rebuild the enum with all values
                if needs_update:
                    # Check which values already exist
                    existing_values = []
                    for val in ['active', 'suspended', 'pending', 'available', 'busy', 'offline']:
                        if val in enum_upper:
                            existing_values.append(val) 
                    
                    # Build complete list with all values in correct order
                    new_enum_values = ['active', 'suspended', 'pending', 'rejected', 'approved', 'available', 'busy', 'offline']
                
                if needs_update:
                    # Add 'rejected' and/or 'approved' to the status ENUM
                    enum_str = "', '".join(new_enum_values)
                    cursor.execute(f"""
                        ALTER TABLE users 
                        MODIFY COLUMN status ENUM('{enum_str}') 
                        DEFAULT 'active'
                    """)
                    added = []
                    if 'rejected' not in enum_upper:
                        added.append('rejected')
                    if 'approved' not in enum_upper:
                        added.append('approved')
                    print(f"[DB] Added {', '.join(added)} status(es) to users table")
        except Exception as e:
            print(f"[DB] Error adding status values: {str(e)}")
            pass
        
        cursor.execute("""
CREATE TABLE IF NOT EXISTS applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    application_type ENUM('seller', 'rider') NOT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    business_name VARCHAR(255),
    business_registration VARCHAR(100),
    business_email VARCHAR(255),
    business_phone VARCHAR(50),
    business_registration_doc TEXT,
    business_permit_doc TEXT,
    tax_registration_doc TEXT,
    id_document_front TEXT,
    id_document_back TEXT,
    experience JSON,
    vehicle_type VARCHAR(50),
    vehicle_make_model VARCHAR(120),
    license_number VARCHAR(50),
    license_expiry DATE,
    license_front TEXT,
    license_back TEXT,
    or_document TEXT,
    cr_document TEXT,
    documents JSON,
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
)
""")

        application_column_defs = [
            ('business_email', "ALTER TABLE applications ADD COLUMN business_email VARCHAR(255) NULL AFTER business_registration"),
            ('business_phone', "ALTER TABLE applications ADD COLUMN business_phone VARCHAR(50) NULL AFTER business_email"),
            ('business_registration_doc', "ALTER TABLE applications ADD COLUMN business_registration_doc TEXT NULL AFTER business_phone"),
            ('business_permit_doc', "ALTER TABLE applications ADD COLUMN business_permit_doc TEXT NULL AFTER business_registration_doc"),
            ('tax_registration_doc', "ALTER TABLE applications ADD COLUMN tax_registration_doc TEXT NULL AFTER business_permit_doc"),
            ('id_document_front', "ALTER TABLE applications ADD COLUMN id_document_front TEXT NULL AFTER tax_registration_doc"),
            ('id_document_back', "ALTER TABLE applications ADD COLUMN id_document_back TEXT NULL AFTER id_document_front"),
            ('vehicle_make_model', "ALTER TABLE applications ADD COLUMN vehicle_make_model VARCHAR(120) NULL AFTER vehicle_type"),
            ('license_expiry', "ALTER TABLE applications ADD COLUMN license_expiry DATE NULL AFTER license_number"),
            ('license_front', "ALTER TABLE applications ADD COLUMN license_front TEXT NULL AFTER license_expiry"),
            ('license_back', "ALTER TABLE applications ADD COLUMN license_back TEXT NULL AFTER license_front"),
            ('or_document', "ALTER TABLE applications ADD COLUMN or_document TEXT NULL AFTER license_back"),
            ('cr_document', "ALTER TABLE applications ADD COLUMN cr_document TEXT NULL AFTER or_document"),
        ]

        for column, statement in application_column_defs:
            try:
                cursor.execute("SHOW COLUMNS FROM applications LIKE %s", (column,))
                if not cursor.fetchone():
                    cursor.execute(statement)
            except Exception as column_error:
                print(f"[DB] Applications column migration warning ({column}): {column_error}")
        
        cursor.execute("""
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NULL COMMENT 'Optional base price - variant prices are primary',
    original_price DECIMAL(10,2),
    category VARCHAR(100),
    total_stock INT DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    image_url VARCHAR(500),
    discount_percentage DECIMAL(5,2) DEFAULT 0.00,
    sizes JSON, -- use JSON to store sizes like ["S","M","L"]
    size_pricing JSON NULL,
    seller_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_flash_sale TINYINT(1) DEFAULT 0,
    flash_sale_status ENUM('none','pending','approved','declined') DEFAULT 'none',
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
)
""")

        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS cart (
                id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    size VARCHAR(10),
    color VARCHAR(50),
    price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )
    """)
        
        # Ensure flash_sale_status column exists (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM products LIKE 'flash_sale_status'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE products ADD COLUMN flash_sale_status ENUM('none','pending','approved','declined') DEFAULT 'none'")
                connection.commit()
                print("[DB] Added flash_sale_status column to products table")
        except Exception as e:
            print(f"[DB] flash_sale_status column may already exist or error: {e}")

        # Ensure flash sale scheduling columns exist (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM products LIKE 'flash_sale_start'")
            has_start = cursor.fetchone()
            cursor.execute("SHOW COLUMNS FROM products LIKE 'flash_sale_end'")
            has_end = cursor.fetchone()
            if not has_start:
                cursor.execute("ALTER TABLE products ADD COLUMN flash_sale_start DATETIME NULL AFTER is_flash_sale")
            if not has_end:
                cursor.execute("ALTER TABLE products ADD COLUMN flash_sale_end DATETIME NULL AFTER flash_sale_start")
            connection.commit()
            print("[DB] Ensured flash_sale_start/end columns exist")
        except Exception as e:
            print(f"[DB] flash_sale_start/end columns may already exist or error: {e}")

        # Ensure approval_status column exists for product moderation (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM products LIKE 'approval_status'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE products ADD COLUMN approval_status ENUM('pending','approved','rejected') DEFAULT 'pending'")
                connection.commit()
                print("[DB] Added products.approval_status column (default pending)")
        except Exception as e:
            print(f"[DB] approval_status column may already exist or error: {e}")
        
        # Ensure email verification columns exist (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM users LIKE 'email_verified'")
            if not cursor.fetchone():
                print("[DB] Adding email verification columns to users table...")
                cursor.execute("ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE")
                cursor.execute("ALTER TABLE users ADD COLUMN verification_code VARCHAR(6)")
                cursor.execute("ALTER TABLE users ADD COLUMN verification_code_expires_at DATETIME")
                cursor.execute("ALTER TABLE users ADD COLUMN verification_attempts INT DEFAULT 0")
                cursor.execute("CREATE INDEX idx_email_verified ON users(email_verified)")
                cursor.execute("CREATE INDEX idx_verification_code ON users(verification_code)")
                connection.commit()
                print("[DB] Email verification columns added successfully")
        except Exception as e:
            print(f"[DB] Email verification columns may already exist or error: {e}")
        
        # Ensure gender column exists (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM users LIKE 'gender'")
            if not cursor.fetchone():
                print("[DB] Adding gender column to users table...")
                cursor.execute("ALTER TABLE users ADD COLUMN gender ENUM('male', 'female', 'other') NULL AFTER address")
                connection.commit()
                print("[DB] Gender column added successfully")
        except Exception as e:
            print(f"[DB] Gender column may already exist or error: {e}")
        
        # Ensure id_document column exists (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM users LIKE 'id_document'")
            if not cursor.fetchone():
                print("[DB] Adding id_document column to users table...")
                cursor.execute("ALTER TABLE users ADD COLUMN id_document TEXT NULL AFTER gender")
                connection.commit()
                print("[DB] ID document column added successfully")
        except Exception as e:
            print(f"[DB] ID document column may already exist or error: {e}")
        
        # Ensure suffix column exists (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM users LIKE 'suffix'")
            if not cursor.fetchone():
                print("[DB] Adding suffix column to users table...")
                cursor.execute("ALTER TABLE users ADD COLUMN suffix VARCHAR(50) NULL AFTER name")
                connection.commit()
                print("[DB] Suffix column added successfully")
        except Exception as e:
            print(f"[DB] Suffix column may already exist or error: {e}")
        
        # Ensure birthday column exists (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM users LIKE 'birthday'")
            if not cursor.fetchone():
                print("[DB] Adding birthday column to users table...")
                cursor.execute("ALTER TABLE users ADD COLUMN birthday DATE NULL AFTER gender")
                connection.commit()
                print("[DB] Birthday column added successfully")
        except Exception as e:
            print(f"[DB] Birthday column may already exist or error: {e}")
        
        # Add profile_picture column to users table (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM users LIKE 'profile_picture'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE users ADD COLUMN profile_picture TEXT NULL")
                print("[MIGRATION] Added users.profile_picture column")
        except Exception as e:
            print(f"[MIGRATION] profile_picture check failed or already present: {e}")
        
        # Add gender column to users table (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM users LIKE 'gender'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE users ADD COLUMN gender ENUM('male', 'female', 'other') NULL")
                print("[MIGRATION] Added users.gender column")
        except Exception as e:
            print(f"[MIGRATION] gender check failed or already present: {e}")
        
        # Add id_document column to users table (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM users LIKE 'id_document'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE users ADD COLUMN id_document TEXT NULL")
                print("[MIGRATION] Added users.id_document column")
        except Exception as e:
            print(f"[MIGRATION] id_document check failed or already present: {e}")

        # Add suspension_expires_at column (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM users LIKE 'suspension_expires_at'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE users ADD COLUMN suspension_expires_at DATETIME NULL AFTER status")
                print("[MIGRATION] Added users.suspension_expires_at column")
        except Exception as e:
            print(f"[MIGRATION] suspension_expires_at check failed or already present: {e}")
        
        # Create orders table
        cursor.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_number VARCHAR(50) UNIQUE NOT NULL,
        buyer_id INT,
        seller_id INT NOT NULL,
        rider_id INT NULL,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        address TEXT NOT NULL,
        city VARCHAR(100) NOT NULL,
        postal_code VARCHAR(20) NOT NULL,
        country VARCHAR(100) DEFAULT 'Philippines',
        total_amount DECIMAL(10, 2) NOT NULL,
        product_subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
        delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
        admin_commission DECIMAL(10, 2) NOT NULL DEFAULT 0,
        seller_earnings DECIMAL(10, 2) NOT NULL DEFAULT 0,
        size_color_stock VARCHAR(255),
        payment_method VARCHAR(50) DEFAULT 'GCASH',
        status ENUM('pending', 'confirmed', 'prepared', 'shipped', 'delivered', 'cancelled', 'accepted_by_rider') DEFAULT 'pending',
        payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
        tracking_number VARCHAR(100) NULL,
        special_notes TEXT NULL,
        cancel_reason TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (buyer_id) REFERENCES users(id),
        FOREIGN KEY (seller_id) REFERENCES users(id),
        FOREIGN KEY (rider_id) REFERENCES users(id)
    )
""")

        # Rider chat messages table for rider-buyer/seller communications
        cursor.execute("""
    CREATE TABLE IF NOT EXISTS rider_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rider_id INT NOT NULL,
        order_id INT NOT NULL,
        participant_type ENUM('buyer','seller') NOT NULL,
        participant_id INT NOT NULL,
        sender_id INT NOT NULL,
        sender_type ENUM('rider','buyer','seller') NOT NULL,
        content TEXT NOT NULL,
        message_type ENUM('text','image','file') DEFAULT 'text',
        file_url VARCHAR(500),
        is_read TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_rider_order (rider_id, order_id),
        INDEX idx_order_participant (order_id, participant_type, participant_id),
        CONSTRAINT fk_rider_messages_rider FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_rider_messages_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
""")

        # Ensure cancel_reason column exists (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM orders LIKE 'cancel_reason'")
            has_cancel_reason = cursor.fetchone() is not None
            if not has_cancel_reason:
                cursor.execute("ALTER TABLE orders ADD COLUMN cancel_reason TEXT NULL")
        except Exception as e:
            print(f"[DB] cancel_reason column check failed: {e}")
        
        # Ensure special_notes column exists (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM orders LIKE 'special_notes'")
            has_special_notes = cursor.fetchone() is not None
            if not has_special_notes:
                cursor.execute("ALTER TABLE orders ADD COLUMN special_notes TEXT NULL AFTER payment_status")
                connection.commit()
                print("[DB] Added orders.special_notes column")
                print("[MIGRATION] Added orders.cancel_reason column")
        except Exception as e:
            # Ignore if column already exists or introspection fails
            print(f"[MIGRATION] cancel_reason check failed or already present: {e}")
        
        # Ensure tracking_number column exists (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM orders LIKE 'tracking_number'")
            has_tracking = cursor.fetchone() is not None
            if not has_tracking:
                cursor.execute("ALTER TABLE orders ADD COLUMN tracking_number VARCHAR(100) NULL AFTER payment_status")
                connection.commit()
                print("[DB] Added orders.tracking_number column")
        except Exception as e:
            print(f"[DB] tracking_number column check failed or already present: {e}")
        
        # Ensure updated_at column exists on orders (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM orders LIKE 'updated_at'")
            has_updated_at = cursor.fetchone() is not None
            if not has_updated_at:
                cursor.execute("ALTER TABLE orders ADD COLUMN updated_at TIMESTAMP NULL AFTER created_at")
                connection.commit()
                print("[DB] Added orders.updated_at column")
        except Exception as e:
            print(f"[DB] updated_at column check failed or already present: {e}")
        
        # Add payment_provider_id column to orders (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM orders LIKE 'payment_provider_id'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE orders ADD COLUMN payment_provider_id VARCHAR(255) NULL AFTER payment_method")
                connection.commit()
                print("[DB] Added orders.payment_provider_id column")
        except Exception as e:
            print(f"[DB] payment_provider_id column check failed or already present: {e}")
        
        # Add payment_provider column to orders (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM orders LIKE 'payment_provider'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE orders ADD COLUMN payment_provider VARCHAR(50) DEFAULT 'xendit' AFTER payment_method")
                connection.commit()
                print("[DB] Added orders.payment_provider column")
        except Exception as e:
            print(f"[DB] payment_provider column check failed or already present: {e}")
        
        # Ensure financial breakdown columns exist on orders (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM orders LIKE 'product_subtotal'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE orders ADD COLUMN product_subtotal DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER total_amount")
                connection.commit()
                print("[DB] Added orders.product_subtotal column")
        except Exception as e:
            print(f"[DB] product_subtotal column check failed or already present: {e}")
        
        try:
            cursor.execute("SHOW COLUMNS FROM orders LIKE 'delivery_fee'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE orders ADD COLUMN delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER product_subtotal")
                connection.commit()
                print("[DB] Added orders.delivery_fee column")
        except Exception as e:
            print(f"[DB] delivery_fee column check failed or already present: {e}")
        
        try:
            cursor.execute("SHOW COLUMNS FROM orders LIKE 'admin_commission'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE orders ADD COLUMN admin_commission DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER delivery_fee")
                connection.commit()
                print("[DB] Added orders.admin_commission column")
        except Exception as e:
            print(f"[DB] admin_commission column check failed or already present: {e}")
        
        try:
            cursor.execute("SHOW COLUMNS FROM orders LIKE 'seller_earnings'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE orders ADD COLUMN seller_earnings DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER admin_commission")
                connection.commit()
                print("[DB] Added orders.seller_earnings column")
        except Exception as e:
            print(f"[DB] seller_earnings column check failed or already present: {e}")
        
        # Create order_items table
        cursor.execute("""
           CREATE TABLE IF NOT EXISTS order_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                product_id INT NOT NULL, -- Link to products table
                product_name VARCHAR(255) NOT NULL,
                quantity INT NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                size VARCHAR(10),
                color VARCHAR(50),
                subtotal DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * price) STORED,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
            )
        """)
        
        # Create deliveries table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS deliveries (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT,
                rider_id INT NULL,
                delivery_address TEXT,
                delivery_fee DECIMAL(10, 2) DEFAULT 0,
                base_fee DECIMAL(10, 2) DEFAULT 50.00,
                distance_bonus DECIMAL(10, 2) DEFAULT 0,
                tips DECIMAL(10, 2) DEFAULT 0,
                peak_bonus DECIMAL(10, 2) DEFAULT 0,
                estimated_time VARCHAR(50),
                actual_time INT DEFAULT 0,
                distance DECIMAL(10, 2) DEFAULT 0,
                pickup_address TEXT,
                pickup_time TIMESTAMP NULL,
                delivery_time TIMESTAMP NULL,
                rating DECIMAL(3, 2) DEFAULT 0,
                customer_rating DECIMAL(3, 2) DEFAULT 0,
                customer_feedback TEXT,
                delivery_type ENUM('standard', 'express', 'same_day', 'scheduled') DEFAULT 'standard',
                priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
                status ENUM('pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'cancelled') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                assigned_at TIMESTAMP NULL,
                completed_at TIMESTAMP NULL,
                FOREIGN KEY (order_id) REFERENCES orders(id),
                FOREIGN KEY (rider_id) REFERENCES users(id)
            )
        """)

        # Update the product_size_stock table creation in init_database()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS product_size_stock (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                size VARCHAR(10) NOT NULL,
                color VARCHAR(50) NOT NULL,
                color_name VARCHAR(100),
                stock_quantity INT NOT NULL DEFAULT 0,
                price DECIMAL(10, 2) NOT NULL,
                discount_price DECIMAL(10, 2) NULL,
                image_order INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                UNIQUE KEY unique_product_size_color (product_id, size, color)
            )
        """)

        cursor.execute("""
    CREATE TABLE IF NOT EXISTS product_variant_images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        size VARCHAR(20) NULL,
        color VARCHAR(50) NOT NULL,
        image_url VARCHAR(255) NOT NULL,
        display_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
""")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                type VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                image_url VARCHAR(255) NULL,
                reference_id INT NULL, -- order id for linking
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        """)
        
        # Add helpful indexes for fast queries (idempotent)
        try:
            cursor.execute("CREATE INDEX idx_notifications_user_read_created ON notifications(user_id, is_read, created_at)")
        except Exception:
            pass
        try:
            cursor.execute("CREATE INDEX idx_notifications_user_id ON notifications(user_id, id)")
        except Exception:
            pass
        
        # Rider/Order/Delivery performance indexes (idempotent)
        try:
            cursor.execute("CREATE INDEX idx_users_role_status ON users(role, status)")
        except Exception:
            pass
        try:
            cursor.execute("CREATE INDEX idx_orders_rider_status_updated ON orders(rider_id, status, updated_at)")
        except Exception:
            pass
        try:
            cursor.execute("CREATE INDEX idx_orders_order_number ON orders(order_number)")
        except Exception:
            pass
        try:
            cursor.execute("CREATE INDEX idx_deliveries_rider_status_created ON deliveries(rider_id, status, created_at)")
        except Exception:
            pass
        try:
            cursor.execute("CREATE INDEX idx_deliveries_status_created ON deliveries(status, created_at)")
        except Exception:
            pass
        try:
            cursor.execute("ALTER TABLE deliveries ADD UNIQUE KEY uniq_deliveries_order (order_id)")
        except Exception:
            pass
        
        # Create chat conversations table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chat_conversations (
                id INT PRIMARY KEY AUTO_INCREMENT,
                order_id INT NULL,
                order_number VARCHAR(50) NULL,
                seller_id INT NULL,
                buyer_id INT NOT NULL,
                admin_id INT NULL,
                participant_name VARCHAR(255) NOT NULL,
                status ENUM('active', 'closed', 'archived') DEFAULT 'active',
                last_message_time TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
                FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_order_chat (order_id, seller_id, buyer_id),
                UNIQUE KEY unique_admin_chat (buyer_id, admin_id)
            )
        """)
        
        # MIGRATION: Add admin_id column and make seller_id nullable if not exists
        try:
            cursor.execute("SHOW COLUMNS FROM chat_conversations LIKE 'admin_id'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE chat_conversations ADD COLUMN admin_id INT NULL AFTER buyer_id")
                cursor.execute("ALTER TABLE chat_conversations ADD FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE")
                cursor.execute("ALTER TABLE chat_conversations MODIFY COLUMN seller_id INT NULL")
                cursor.execute("ALTER TABLE chat_conversations ADD UNIQUE KEY unique_admin_chat (buyer_id, admin_id)")
                connection.commit()
                print("[MIGRATION] Added admin_id column to chat_conversations")
        except Exception as e:
            print(f"[MIGRATION] admin_id column check/alter failed (may already exist): {e}")
        
        # MIGRATION: Add rider_id column if not exists
        try:
            cursor.execute("SHOW COLUMNS FROM chat_conversations LIKE 'rider_id'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE chat_conversations ADD COLUMN rider_id INT NULL AFTER admin_id")
                cursor.execute("ALTER TABLE chat_conversations ADD FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE")
                connection.commit()
                print("[MIGRATION] Added rider_id column to chat_conversations")
        except Exception as e:
            print(f"[MIGRATION] rider_id column check/alter failed (may already exist): {e}")
        
        # MIGRATION: Make buyer_id nullable to support admin-rider chats
        try:
            # Check current nullability of buyer_id column
            cursor.execute("""
                SELECT IS_NULLABLE 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'chat_conversations' 
                AND COLUMN_NAME = 'buyer_id'
            """)
            result = cursor.fetchone()
            
            if result:
                is_nullable = result.get('IS_NULLABLE') if isinstance(result, dict) else result[0] if isinstance(result, (list, tuple)) else None
                if is_nullable == 'NO':
                    # Column is NOT NULL, need to make it nullable
                    cursor.execute("ALTER TABLE chat_conversations MODIFY COLUMN buyer_id INT NULL")
                    connection.commit()
                    print("[MIGRATION] Made buyer_id nullable in chat_conversations")
                else:
                    print("[MIGRATION] buyer_id is already nullable")
            else:
                # Column might not exist or query failed, try direct ALTER as fallback
                print("[MIGRATION] Could not check buyer_id nullability, attempting direct ALTER")
                cursor.execute("ALTER TABLE chat_conversations MODIFY COLUMN buyer_id INT NULL")
                connection.commit()
                print("[MIGRATION] Force-applied: Made buyer_id nullable")
        except Exception as e:
            print(f"[MIGRATION] buyer_id nullable check/alter failed: {e}")
            # Try direct ALTER as last resort
            try:
                cursor.execute("ALTER TABLE chat_conversations MODIFY COLUMN buyer_id INT NULL")
                connection.commit()
                print("[MIGRATION] Last-resort: Made buyer_id nullable")
            except Exception as e2:
                print(f"[MIGRATION] All attempts to make buyer_id nullable failed: {e2}")
                print("[MIGRATION] You may need to manually run: ALTER TABLE chat_conversations MODIFY COLUMN buyer_id INT NULL")
        
        # Create chat messages table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INT PRIMARY KEY AUTO_INCREMENT,
                conversation_id INT NOT NULL,
                sender_id INT NOT NULL,
                sender_type ENUM('seller', 'buyer', 'rider') NOT NULL,
                content TEXT NOT NULL,
                message_type ENUM('text', 'image', 'file', 'system') DEFAULT 'text',
                file_url VARCHAR(500) NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # MIGRATION: ensure chat_messages.sender_type supports rider and admin messages (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM chat_messages LIKE 'sender_type'")
            row = cursor.fetchone()
            if row and isinstance(row, tuple):
                column_type = row[1] if len(row) > 1 else ''
            elif row and isinstance(row, dict):
                column_type = row.get('Type', '')
            else:
                column_type = ''
            # If 'admin' not present in ENUM, alter the table to add it
            if 'enum(' in str(column_type).lower() and 'admin' not in str(column_type).lower():
                cursor.execute("""
                    ALTER TABLE chat_messages 
                    MODIFY COLUMN sender_type ENUM('seller','buyer','rider','admin') NOT NULL
                """)
                connection.commit()
                print("[MIGRATION] Updated chat_messages.sender_type to include 'admin'")
        except Exception as e:
            print(f"[MIGRATION] sender_type enum check/alter failed (may already be updated): {e}")
        
        # Create user addresses table (for account address book)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_addresses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                label VARCHAR(50) NULL,
                contact_name VARCHAR(255) NULL,
                contact_phone VARCHAR(50) NULL,
                region_code VARCHAR(20) NULL,
                region VARCHAR(255) NULL,
                province_code VARCHAR(20) NULL,
                province VARCHAR(255) NULL,
                city_code VARCHAR(20) NULL,
                city VARCHAR(255) NULL,
                barangay_code VARCHAR(20) NULL,
                barangay VARCHAR(255) NULL,
                street TEXT NULL,
                postal_code VARCHAR(20) NULL,
                latitude DECIMAL(10,8) NULL,
                longitude DECIMAL(11,8) NULL,
                is_default TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        
        # Create user enforcement actions table (idempotent)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_enforcement_actions (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                admin_id INT NOT NULL,
                action ENUM('warn','suspend','disable','reinstate') NOT NULL,
                reason TEXT NULL,
                duration_days INT NULL,
                expires_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Create rider payments table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS rider_payments (
                id INT PRIMARY KEY AUTO_INCREMENT,
                rider_id INT NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                period_start DATE NOT NULL,
                period_end DATE NOT NULL,
                deliveries_count INT DEFAULT 0,
                base_earnings DECIMAL(10, 2) DEFAULT 0,
                bonus_earnings DECIMAL(10, 2) DEFAULT 0,
                tips_total DECIMAL(10, 2) DEFAULT 0,
                payment_method ENUM('bank_transfer', 'gcash', 'paymaya') DEFAULT 'gcash',
                status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
                processed_at TIMESTAMP NULL,
                reference_number VARCHAR(100) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (rider_id) REFERENCES users(id)
            )
        """)
        
        # Create delivery ratings table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS delivery_ratings (
                id INT PRIMARY KEY AUTO_INCREMENT,
                delivery_id INT NOT NULL,
                order_id INT NOT NULL,
                customer_id INT NOT NULL,
                rider_id INT NOT NULL,
                rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
                comment TEXT NULL,
                delivery_speed_rating INT DEFAULT 5,
                communication_rating INT DEFAULT 5,
                professionalism_rating INT DEFAULT 5,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (delivery_id) REFERENCES deliveries(id),
                FOREIGN KEY (order_id) REFERENCES orders(id),
                FOREIGN KEY (customer_id) REFERENCES users(id),
                FOREIGN KEY (rider_id) REFERENCES users(id)
            )
        """)
        
        # Create delivery proof table for photos, signatures, and verification
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS delivery_proof (
                id INT PRIMARY KEY AUTO_INCREMENT,
                delivery_id INT NOT NULL,
                order_id INT NOT NULL,
                rider_id INT NOT NULL,
                photo_url VARCHAR(500) NULL,
                signature_data TEXT NULL,
                delivery_notes TEXT NULL,
                customer_present BOOLEAN DEFAULT FALSE,
                customer_id_verified BOOLEAN DEFAULT FALSE,
                proof_type ENUM('photo', 'signature', 'customer_confirmation', 'combined') DEFAULT 'combined',
                location_lat DECIMAL(10, 8) NULL,
                location_lng DECIMAL(11, 8) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        # Order status history table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS order_status_history (
                id INT PRIMARY KEY AUTO_INCREMENT,
                order_id INT NOT NULL,
                status VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
            )
        """)
        
        # Create password reset tokens table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                token VARCHAR(255) NOT NULL UNIQUE,
                expires_at TIMESTAMP NOT NULL,
                used TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Migrate existing products table to make price optional
        try:
            cursor.execute("SHOW COLUMNS FROM products LIKE 'price'")
            price_column = cursor.fetchone()
            if price_column and 'NOT NULL' in str(price_column):
                cursor.execute("ALTER TABLE products MODIFY COLUMN price DECIMAL(10,2) NULL COMMENT 'Optional base price - variant prices are primary'")
                print("[MIGRATION] Updated products.price column to be optional")
        except Exception as e:
            print(f"[MIGRATION] Price column migration failed or already done: {e}")
        
        # Try to add FULLTEXT index for better search (idempotent)
        try:
            cursor.execute("ALTER TABLE products ADD FULLTEXT INDEX ft_products_name_desc_cat (name, description, category)")
            print("[DB] Added FULLTEXT index ft_products_name_desc_cat")
        except Exception:
            pass
        
        cursor.execute("""
    CREATE TABLE IF NOT EXISTS product_reviews (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        product_id INT NOT NULL,
        order_id INT NOT NULL,
        rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        UNIQUE KEY unique_review (user_id, product_id, order_id)
    )
""")
        
        # Media for product reviews (images/videos)
        cursor.execute("""
    CREATE TABLE IF NOT EXISTS product_review_media (
        id INT PRIMARY KEY AUTO_INCREMENT,
        review_id INT NOT NULL,
        media_type ENUM('image','video') NOT NULL,
        url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (review_id) REFERENCES product_reviews(id) ON DELETE CASCADE,
        INDEX idx_prm_review (review_id)
    )
""")
        
        # Idempotent review table migrations (indexes/columns)
        try:
            cursor.execute("CREATE INDEX idx_product_reviews_product_created ON product_reviews(product_id, created_at)")
        except Exception:
            pass
        try:
            cursor.execute("CREATE INDEX idx_product_reviews_product_rating ON product_reviews(product_id, rating)")
        except Exception:
            pass
        # Ensure updated_at column exists for edits
        try:
            cursor.execute("SHOW COLUMNS FROM product_reviews LIKE 'updated_at'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE product_reviews ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")
        except Exception:
            pass
        
        # Create wishlist table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS wishlist (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                product_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                UNIQUE KEY unique_wishlist (user_id, product_id)
            )
""")
        
        # Create stock alerts table for back-in-stock notifications
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS stock_alerts (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                product_id INT NOT NULL,
                size VARCHAR(10) NULL,
                color VARCHAR(50) NULL,
                notified_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                UNIQUE KEY unique_stock_alert (user_id, product_id, size, color)
            )
""")
        
        # Add indexes for stock alerts performance (idempotent)
        try:
            cursor.execute("CREATE INDEX idx_stock_alerts_product ON stock_alerts(product_id, notified_at)")
        except Exception:
            pass
        try:
            cursor.execute("CREATE INDEX idx_stock_alerts_user ON stock_alerts(user_id)")
        except Exception:
            pass

        # Create price drop alerts table (notify users when price decreases or hits target)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS price_drop_alerts (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                product_id INT NOT NULL,
                initial_price DECIMAL(10,2) NULL,
                target_price DECIMAL(10,2) NULL,
                notified_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                UNIQUE KEY uniq_price_drop (user_id, product_id, target_price)
            )
        """)
        try:
            cursor.execute("CREATE INDEX idx_price_drop_product ON price_drop_alerts(product_id, notified_at)")
        except Exception:
            pass
        try:
            cursor.execute("CREATE INDEX idx_price_drop_user ON price_drop_alerts(user_id)")
        except Exception:
            pass
        
        # Create refund requests table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS refund_requests (
                id INT PRIMARY KEY AUTO_INCREMENT,
                order_id INT NOT NULL,
                user_id INT NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                reason TEXT NOT NULL,
                status ENUM('pending', 'approved', 'rejected', 'processing', 'completed', 'failed') DEFAULT 'pending',
                payment_provider_id VARCHAR(255) NULL,
                payment_provider VARCHAR(50) NULL,
                refund_provider_id VARCHAR(255) NULL COMMENT 'ID from payment provider for refund transaction',
                admin_notes TEXT NULL,
                processed_by INT NULL COMMENT 'Admin user ID who processed the refund',
                processed_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL
            )
        """)
        
        # Seed default admin (idempotent)
        try:
            cursor.execute("SELECT id, role, status FROM users WHERE email = %s", (ADMIN_EMAIL,))
            row = cursor.fetchone()
            if not row:
                cursor.execute(
                    """
                    INSERT INTO users (name, email, password, role, status)
                    VALUES (%s, %s, %s, 'admin', 'active')
                    """,
                    (ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD)
                )
                print(f"[SEED] Created default admin {ADMIN_EMAIL}")
            else:
                # Ensure role/status are correct
                role = row[1] if isinstance(row, tuple) else row.get('role')
                status = row[2] if isinstance(row, tuple) else row.get('status')
                if role != 'admin' or status != 'active':
                    cursor.execute(
                        "UPDATE users SET role='admin', status='active' WHERE email = %s",
                        (ADMIN_EMAIL,)
                    )
                    print(f"[SEED] Updated existing user {ADMIN_EMAIL} to admin/active")
        except Exception as e:
            print(f"[SEED] Admin seeding skipped: {e}")

        connection.commit()
        cursor.close()
        connection.close()
        print("Database tables created successfully!")

def geocode_with_nominatim(address, countrycodes='ph'):
    """Geocode a free-form address string using Nominatim (OSM).
    Returns (lat, lng) as floats, or (None, None) on failure.
    """
    try:
        if not address or not isinstance(address, str):
            return None, None
        params = {
            'format': 'json',
            'limit': 1,
            'q': address,
        }
        if countrycodes:
            params['countrycodes'] = countrycodes
        headers = { 'User-Agent': 'Grande-Ecom/1.0 (contact: admin@example.com)' }
        r = requests.get('https://nominatim.openstreetmap.org/search', params=params, headers=headers, timeout=10)
        if r.status_code != 200:
            print(f"[NOMINATIM] HTTP {r.status_code}: {r.text[:120]}")
            return None, None
        data = r.json() if r.content else []
        if isinstance(data, list) and data:
            lat = float(data[0]['lat'])
            lng = float(data[0]['lon'])
            return lat, lng
    except Exception as e:
        print(f"[NOMINATIM] Geocode error for '{address}': {e}")
    return None, None
def generate_order_number():
    return f"ORD-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"

def create_delivery_from_order(order_id, order_data):
    """Create a delivery record when an order is confirmed.

    Business rule:
    - The buyer's delivery fee (orders.delivery_fee) is paid out in full to the rider
      as the base delivery earning. This fee does NOT reduce the seller's earnings
      or affect the admin commission, which are both based only on product_subtotal.
    """
    connection = get_db_connection()
    if not connection:
        return False
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get order details (includes financial breakdown)
        cursor.execute("""
            SELECT * FROM orders WHERE id = %s
        """, (order_id,))
        
        order = cursor.fetchone()
        if not order:
            return False
        
        # Use the order's delivery_fee as the rider's base earning so that
        # 100% of the delivery fee paid by the buyer goes to the rider.
        try:
            delivery_fee = float(order.get('delivery_fee') or 0.0)
        except (TypeError, ValueError):
            delivery_fee = 0.0
        
        # Fallback for legacy orders that may not have delivery_fee populated
        if delivery_fee <= 0:
            delivery_fee = 50.0
        
        base_fee = delivery_fee
        distance = 5.0  # Default distance in km (can be refined later)
        estimated_time = "30-45 minutes"
        
        # Determine delivery type based on order total (does NOT change payout)
        try:
            order_total = float(order.get('total_amount') or 0.0)
        except (TypeError, ValueError):
            order_total = 0.0
        
        delivery_type = 'standard'
        if order_total > 5000:
            delivery_type = 'same_day'
            estimated_time = "15-25 minutes"
        elif order_total > 2000:
            delivery_type = 'express'
            estimated_time = "20-30 minutes"
        
        # Create delivery address from order
        delivery_address = f"{order['address']}, {order['city']} {order['postal_code']}, {order['country']}"
        
        # Get seller's actual business address from users.address (primary source)
        pickup_address = "Seller address not available"
        try:
            # Get address from users table (stored as JSON during registration)
            cursor.execute("SELECT address FROM users WHERE id = %s", (order['seller_id'],))
            user_result = cursor.fetchone()
            
            if user_result and user_result.get('address'):
                try:
                    address_json = user_result['address']
                    if isinstance(address_json, str):
                        # Try to parse as JSON first
                        if address_json.startswith('{'):
                            address_data = json.loads(address_json)
                        else:
                            # If it's a plain string, use it directly
                            pickup_address = address_json
                            address_data = None
                    elif isinstance(address_json, dict):
                        address_data = address_json
                    else:
                        address_data = {}
                    
                    # If we have address_data (JSON), build from components
                    if address_data:
                        address_parts = []
                        if address_data.get('street'): address_parts.append(address_data['street'])
                        if address_data.get('barangay'): address_parts.append(address_data['barangay'])
                        if address_data.get('city'): address_parts.append(address_data['city'])
                        if address_data.get('province'): address_parts.append(address_data['province'])
                        if address_data.get('region'): address_parts.append(address_data['region'])
                        
                        if address_parts:
                            pickup_address = ', '.join([p for p in address_parts if p.strip()])
                        elif address_data.get('address'):
                            pickup_address = address_data['address']
                    
                except Exception as e:
                    print(f"[DELIVERY] Error parsing seller address JSON: {e}")
                    # If JSON parsing fails, try using address as string
                    if isinstance(user_result['address'], str) and not user_result['address'].startswith('{'):
                        pickup_address = user_result['address']
            
            # Fallback: try user_addresses if users.address is not available
            if pickup_address == "Seller address not available":
                cursor.execute("""
                    SELECT CONCAT_WS(', ',
                        NULLIF(street, ''),
                        NULLIF(barangay, ''),
                        NULLIF(city, ''),
                        NULLIF(province, ''),
                        NULLIF(region, '')
                    ) as full_address
                    FROM user_addresses
                    WHERE user_id = %s
                    ORDER BY 
                        CASE WHEN label = 'Business Address' THEN 0 ELSE 1 END,
                        is_default DESC, 
                        updated_at DESC
                    LIMIT 1
                """, (order['seller_id'],))
                address_result = cursor.fetchone()
                
                if address_result and address_result.get('full_address'):
                    pickup_address = address_result['full_address'].strip()
                    pickup_address = ', '.join([p.strip() for p in pickup_address.split(',') if p.strip()])
                
                # Last fallback: try applications table
                if pickup_address == "Seller address not available":
                    try:
                        cursor.execute("""
                            SELECT experience FROM applications 
                            WHERE user_id = %s AND application_type = 'seller' AND status = 'approved'
                            ORDER BY updated_at DESC LIMIT 1
                        """, (order['seller_id'],))
                        app_result = cursor.fetchone()
                        if app_result and app_result.get('experience'):
                            try:
                                exp_data = json.loads(app_result['experience']) if isinstance(app_result['experience'], str) else app_result['experience']
                                if exp_data.get('address'):
                                    pickup_address = exp_data['address']
                            except:
                                pass
                    except Exception as e:
                        print(f"[DELIVERY] Error getting address from applications: {e}")
        except Exception as e:
            print(f"[DELIVERY] Error getting seller address: {e}")
            pickup_address = "Seller address not available"
        
        print(f"[DELIVERY] Using pickup address for seller {order['seller_id']}: {pickup_address}")
        
        # Insert delivery record
        cursor.execute("""
            INSERT INTO deliveries (
                order_id,
                delivery_address,
                pickup_address,
                delivery_fee,
                base_fee,
                distance,
                estimated_time,
                delivery_type,
                status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'pending')
        """, (
            order_id,
            delivery_address,
            pickup_address,
            delivery_fee,
            base_fee,
            distance,
            estimated_time,
            delivery_type
        ))
        
        connection.commit()
        print(f"[DELIVERY] Created delivery record for order {order['order_number']}")
        return True
        
    except Exception as e:
        connection.rollback()
        print(f"[DELIVERY] Error creating delivery for order {order_id}: {str(e)}")
        return False
        
    finally:
        cursor.close()
        connection.close()

def get_user_by_id(user_id):
    connection = get_db_connection()
    if connection:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        cursor.close()
        connection.close()
        return user
    return None

# Add this with other helper functions
def get_user_id_from_token(token):
    """Extract user_id from JWT token"""
    if not token:
        return None
        
    try:
        # Remove 'Bearer ' prefix if present
        if token.startswith('Bearer '):
            token = token.split(' ')[1]
            
        # Decode the JWT token
        payload = jwt.decode(
            token,
            app.config['SECRET_KEY'],
            algorithms=["HS256"]
        )
        
        return payload.get('user_id')
        
    except jwt.ExpiredSignatureError:
        print("Token has expired")
        return None
    except jwt.InvalidTokenError as e:
        print(f"Invalid token: {str(e)}")
        return None
    except Exception as e:
        print(f"Error decoding token: {str(e)}")
        return None

def auto_assign_rider_to_order(order_id):
    """Automatically assign available rider to order when ready for pickup"""
    connection = get_db_connection()
    if not connection:
        print(f"[AUTO-ASSIGN] Database connection failed for order {order_id}")
        return False
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get order details
        cursor.execute("""
            SELECT o.*, d.id as delivery_id 
            FROM orders o
            LEFT JOIN deliveries d ON o.id = d.order_id
            WHERE o.id = %s
        """, (order_id,))
        
        order = cursor.fetchone()
        if not order:
            print(f"[AUTO-ASSIGN] Order {order_id} not found")
            return False
        
        # Create delivery record if it doesn't exist
        if not order['delivery_id']:
            delivery_created = create_delivery_from_order(order_id, order)
            if not delivery_created:
                print(f"[AUTO-ASSIGN] Failed to create delivery for order {order_id}")
                return False
            
            # Re-fetch the order with delivery_id
            cursor.execute("""
                SELECT o.*, d.id as delivery_id 
                FROM orders o
                LEFT JOIN deliveries d ON o.id = d.order_id
                WHERE o.id = %s
            """, (order_id,))
            order = cursor.fetchone()
        
        # Find available riders
        cursor.execute("""
            SELECT id, name, email, phone, location_lat, location_lng
            FROM users 
            WHERE role = 'rider' 
            AND status = 'available'
            AND is_active = 1
            ORDER BY created_at ASC
            LIMIT 1
        """)
        
        available_rider = cursor.fetchone()
        
        if not available_rider:
            print(f"[AUTO-ASSIGN] No available riders found for order {order['order_number']}")
            return False
        
        # Assign rider to the order and delivery
        cursor.execute("""
            UPDATE orders 
            SET rider_id = %s, status = 'accepted_by_rider' 
            WHERE id = %s
        """, (available_rider['id'], order_id))
        
        cursor.execute("""
            UPDATE deliveries 
            SET rider_id = %s, status = 'assigned', assigned_at = NOW()
            WHERE order_id = %s
        """, (available_rider['id'], order_id))
        
        # Update rider status to busy
        cursor.execute("""
            UPDATE users 
            SET status = 'busy' 
            WHERE id = %s
        """, (available_rider['id'],))
        
        connection.commit()
        
        print(f"[AUTO-ASSIGN] Successfully assigned rider {available_rider['name']} to order {order['order_number']}")
        return {
            'success': True,
            'rider_id': available_rider['id'],
            'rider_name': available_rider['name'],
            'order_number': order['order_number']
        }
        
    except Exception as e:
        connection.rollback()
        print(f"[AUTO-ASSIGN] Error assigning rider to order {order_id}: {str(e)}")
        return False
        
    finally:
        cursor.close()
        connection.close()

def notify_available_riders_of_delivery(order_id, order_number, product_image=None):
    """
    Notify available riders that a new delivery is ready for acceptance.
    Returns the number of riders notified.
    """
    connection = get_db_connection()
    if not connection:
        print(f"[RIDER_NOTIFY] Database connection failed for order {order_id}")
        return 0

    cursor = connection.cursor(dictionary=True)
    notified = 0

    try:
        # Fetch riders who are marked as available/active
        cursor.execute("""
            SELECT id FROM users
            WHERE role = 'rider'
              AND is_active = 1
              AND status IN ('available', 'active')
        """)
        riders = cursor.fetchall() or []

        for rider in riders:
            rider_id = rider['id']

            # Avoid duplicate notifications for the same order
            cursor.execute("""
                SELECT 1 FROM notifications
                WHERE user_id = %s AND type = 'delivery_available'
                  AND reference_id = %s
                LIMIT 1
            """, (rider_id, order_id))
            if cursor.fetchone():
                continue

            cursor.execute("""
                INSERT INTO notifications (user_id, type, message, reference_id, image_url, created_at)
                VALUES (%s, %s, %s, %s, %s, NOW())
            """, (
                rider_id,
                'delivery_available',
                f"Order #{order_number} is ready for pickup. Open Available Deliveries to accept it.",
                order_id,
                product_image
            ))
            notified += 1

        connection.commit()
        print(f"[RIDER_NOTIFY] Notified {notified} rider(s) about order #{order_number}")
        return notified

    except Exception as e:
        connection.rollback()
        print(f"[RIDER_NOTIFY] Error notifying riders for order {order_number}: {e}")
        return notified
    finally:
        cursor.close()
        connection.close()

def calculate_rider_distance(rider_lat, rider_lng, order_lat, order_lng):
    import random
    return round(random.uniform(0.5, 10.0), 2)

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        print("Authorization header:", request.headers.get('Authorization'))

        auth_header = request.headers.get('Authorization')
        if auth_header:
            parts = auth_header.split()
            if len(parts) >= 2:
                token = parts[-1]
            else:
                token = auth_header

        def try_decode(tok):
            if not tok:
                return None
            # Sanitize token: remove surrounding quotes or stray Bearer
            sanitized = tok.strip().strip('"').strip("'")
            if sanitized.lower().startswith('bearer '):
                sanitized = sanitized.split(' ', 1)[1].strip()
            try:
                return jwt.decode(sanitized, app.config['SECRET_KEY'], algorithms=["HS256"])  # returns payload
            except jwt.InvalidTokenError as e:
                print(f"JWT decode failed: {e}")
                return None
            except Exception as e:
                print(f"JWT unexpected error: {e}")
                return None

        payload = try_decode(token)

        # Fallback to Flask session if JWT missing/invalid but user has a server-side session
        if not payload and session.get('user_id'):
            payload = { 'user_id': session.get('user_id') }

        if not payload:
            # Distinguish missing vs invalid header for clearer client behavior
            if not auth_header:
                return jsonify({'error': 'Token is missing'}), 401
            return jsonify({'error': 'Invalid token'}), 401

        # Load current_user from DB
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500

        cursor = connection.cursor(dictionary=True)
        cursor.execute('SELECT * FROM users WHERE id = %s', (payload.get('user_id'),))
        current_user = cursor.fetchone()

        if not current_user:
            cursor.close(); connection.close()
            return jsonify({'error': 'User not found'}), 401

        # Enforce account status
        try:
            # Auto-lift temporary suspension if expired
            if current_user.get('status') == 'suspended' and current_user.get('suspension_expires_at'):
                try:
                    exp = current_user['suspension_expires_at']
                    if isinstance(exp, str):
                        try:
                            exp = datetime.fromisoformat(exp)
                        except Exception:
                            exp = None
                except Exception:
                    exp = None
                if exp and datetime.now() > exp:
                    upd = connection.cursor()
                    upd.execute("UPDATE users SET status='active', suspension_expires_at = NULL WHERE id=%s", (current_user['id'],))
                    connection.commit()
                    upd.close()
                    current_user['status'] = 'active'
                    current_user['suspension_expires_at'] = None
            # Block disabled or still suspended
            if int(current_user.get('is_active', 1) or 0) == 0:
                cursor.close(); connection.close()
                return jsonify({'error': 'Account disabled. Contact support.'}), 403
            if current_user.get('status') == 'suspended':
                cursor.close(); connection.close()
                return jsonify({'error': 'Account suspended. Contact support.'}), 403
        except Exception as _:
            pass

        cursor.close(); connection.close()
        return f(current_user, *args, **kwargs)

    return decorated

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
    return response

# Serve the user account page (render without auth; API calls remain protected)
@app.route('/account')
def serve_account():
    try:
        return render_template('UserProfile/account.html')
    except Exception as e:
        print('Error rendering account page:', e)
        return redirect('/')

@app.route('/wishlist')
def serve_wishlist_page():
    try:
        return render_template('UserProfile/wishlist.html')
    except Exception as e:
        print('Error rendering wishlist page:', e)
        return redirect('/')

@app.route('/seller/inventory')
def serve_seller_inventory():
    try:
        return render_template('SellerDashboard/inventory.html')
    except Exception as e:
        print('Error rendering seller inventory page:', e)
        return redirect('/')

def admin_required(f):
    @wraps(f)
    def wrapper(current_user, *args, **kwargs):
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        role = current_user.get('role') or ''
        if role != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        return f(current_user, *args, **kwargs)
    return wrapper

def rider_required(f):
    @wraps(f)
    def wrapper(current_user, *args, **kwargs):
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        role = current_user.get('role') or ''
        if role != 'rider':
            return jsonify({'error': 'Rider access required'}), 403
        return f(current_user, *args, **kwargs)
    return wrapper
def create_notification(user_id, notification_type, message, reference_id=None, image_url=None):
    """Create a notification for a user"""
    connection = get_db_connection()
    if not connection:
        return False
    
    cursor = connection.cursor()
    try:
        cursor.execute("""
            INSERT INTO notifications (user_id, type, message, reference_id, image_url)
            VALUES (%s, %s, %s, %s, %s)
        """, (user_id, notification_type, message, reference_id, image_url))
        
        connection.commit()
        return True
    except Exception as e:
        print(f"Error creating notification: {str(e)}")
        connection.rollback()
        return False
    finally:
        cursor.close()
        connection.close()

# Notification status messages
def get_status_message(status, order_number):
    """Get user-friendly notification message based on order status"""
    messages = {
        'pending': f"Your order #{order_number} has been received and is being processed.",
        'confirmed': f"Your order #{order_number} has been confirmed by the seller.",
        'prepared': f"Your order #{order_number} is being prepared for shipment.",
        'shipped': f"Your order #{order_number} has been shipped and is on its way!",
        'delivered': f"Your order #{order_number} has been successfully delivered.",
        'cancelled': f"Your order #{order_number} has been cancelled."
    }
    return messages.get(status, f"Your order #{order_number} status has been updated to {status}.")

def trigger_stock_alerts(product_id, size, color):
    """Trigger stock alerts for users watching a specific product variant"""
    connection = get_db_connection()
    if not connection:
        return
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get current stock for the variant
        cursor.execute("""
            SELECT stock_quantity FROM product_size_stock
            WHERE product_id = %s AND size = %s AND color = %s
        """, (product_id, size, color))
        
        stock_result = cursor.fetchone()
        if not stock_result or stock_result['stock_quantity'] <= 0:
            return  # Only notify when stock is positive
        
        # Find all users with alerts for this variant that haven't been notified
        cursor.execute("""
            SELECT sa.id, sa.user_id, p.name as product_name, p.image_url
            FROM stock_alerts sa
            JOIN products p ON sa.product_id = p.id
            WHERE sa.product_id = %s AND sa.size = %s AND sa.color = %s 
                  AND sa.notified_at IS NULL
        """, (product_id, size, color))
        
        alerts = cursor.fetchall()
        
        if not alerts:
            return
        
        # Create notifications for each subscribed user
        for alert in alerts:
            message = f"{alert['product_name']} ({size}/{color}) is back in stock!"
            
            cursor.execute("""
                INSERT INTO notifications (user_id, type, message, image_url, reference_id)
                VALUES (%s, 'stock_alert', %s, %s, %s)
            """, (alert['user_id'], message, alert['image_url'], product_id))
            
            # Mark alert as notified
            cursor.execute("""
                UPDATE stock_alerts SET notified_at = NOW()
                WHERE id = %s
            """, (alert['id'],))
            
            print(f"[STOCK ALERT] Notified user {alert['user_id']} about product {product_id} ({size}/{color})")
        
        connection.commit()
        print(f"[STOCK ALERT] Sent {len(alerts)} notifications for product {product_id} ({size}/{color})")
        
    except Exception as e:
        connection.rollback()
        print(f"[STOCK ALERT] Error triggering alerts for product {product_id}: {str(e)}")
    finally:
        cursor.close()
        connection.close()

def trigger_price_drop_alerts(product_id):
    """Trigger price drop alerts for users watching a product when price decreases or hits target.
    This checks the current minimum effective variant price against stored initial/target prices.
    """
    connection = get_db_connection()
    if not connection:
        return False

    cursor = connection.cursor(dictionary=True)
    try:
        # Compute current minimum effective price across variants in stock
        cursor.execute(
            """
            SELECT MIN(COALESCE(pss.discount_price, pss.price)) AS min_price
            FROM product_size_stock pss
            WHERE pss.product_id = %s AND pss.stock_quantity > 0
            """,
            (product_id,)
        )
        row = cursor.fetchone()
        current_min_price = float(row['min_price']) if row and row.get('min_price') is not None else None

        if current_min_price is None:
            return False

        # Find alerts to notify: target_price reached OR price dropped below initial_price (when no target)
        cursor.execute(
            """
            SELECT a.id, a.user_id, a.product_id, a.initial_price, a.target_price, p.name, 
                   COALESCE((SELECT pvi.image_url FROM product_variant_images pvi 
                             WHERE pvi.product_id = p.id ORDER BY pvi.display_order ASC, pvi.id ASC LIMIT 1),
                            '/static/uploads/products/placeholder.svg') AS image_url
            FROM price_drop_alerts a
            JOIN products p ON p.id = a.product_id
            WHERE a.product_id = %s
              AND a.notified_at IS NULL
              AND (
                    (a.target_price IS NOT NULL AND %s <= a.target_price)
                 OR (a.target_price IS NULL AND a.initial_price IS NOT NULL AND %s < a.initial_price)
              )
            """,
            (product_id, current_min_price, current_min_price)
        )
        alerts = cursor.fetchall() or []
        if not alerts:
            return False

        for alert in alerts:
            msg = f"Good news! {alert['name']} dropped to ₱{current_min_price:.2f}."
            try:
                cursor.execute(
                    """
                    INSERT INTO notifications (user_id, type, message, image_url, reference_id)
                    VALUES (%s, 'price_drop', %s, %s, %s)
                    """,
                    (alert['user_id'], msg, alert['image_url'], product_id)
                )
                cursor.execute(
                    "UPDATE price_drop_alerts SET notified_at = NOW() WHERE id = %s",
                    (alert['id'],)
                )
            except Exception as _:
                pass

        connection.commit()
        return True
    except Exception as e:
        connection.rollback()
        print(f"[PRICE DROP] Error triggering alerts for product {product_id}: {e}")
        return False
    finally:
        cursor.close()
        connection.close()

def restore_order_stock(order_id, reason="cancelled"):
    """Restore stock when an order is cancelled or rejected"""
    connection = get_db_connection()
    if not connection:
        print(f"[STOCK] Failed to connect to database for order {order_id} stock restoration")
        return False
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Start transaction
        cursor.execute("START TRANSACTION")
        
        # Get order details
        cursor.execute("""
            SELECT order_number, status FROM orders WHERE id = %s
        """, (order_id,))
        
        order = cursor.fetchone()
        if not order:
            print(f"[STOCK] Order {order_id} not found for stock restoration")
            return False
        
        # Get all order items
        cursor.execute("""
            SELECT product_id, quantity, size, color, product_name 
            FROM order_items 
            WHERE order_id = %s
        """, (order_id,))
        
        order_items = cursor.fetchall()
        
        if not order_items:
            print(f"[STOCK] No items found for order {order['order_number']}")
            return False
        
        # Restore stock for each item
        for item in order_items:
            # Get previous stock
            cursor.execute("""
                SELECT stock_quantity FROM product_size_stock
                WHERE product_id = %s AND size = %s AND color = %s
            """, (item['product_id'], item['size'], item['color']))
            
            prev_stock_result = cursor.fetchone()
            prev_stock = prev_stock_result['stock_quantity'] if prev_stock_result else 0
            
            cursor.execute("""
                UPDATE product_size_stock 
                SET stock_quantity = stock_quantity + %s
                WHERE product_id = %s AND size = %s AND color = %s
            """, (
                item['quantity'],
                item['product_id'],
                item['size'],
                item['color']
            ))
            
            # Trigger stock alerts if stock went from 0 to positive
            if prev_stock == 0:
                try:
                    trigger_stock_alerts(item['product_id'], item['size'], item['color'])
                except Exception as alert_error:
                    print(f"[STOCK ALERT] Error triggering alerts: {alert_error}")
            
            print(f"[STOCK] Restored {item['quantity']} units to product {item['product_id']} ({item['size']}/{item['color']}) - Order {order['order_number']} {reason}")
        
        # Update total stock in products table
        for item in order_items:
            cursor.execute("""
                UPDATE products 
                SET total_stock = (
                    SELECT COALESCE(SUM(stock_quantity), 0) 
                    FROM product_size_stock 
                    WHERE product_id = %s
                )
                WHERE id = %s
            """, (item['product_id'], item['product_id']))
        
        # Commit transaction
        connection.commit()
        print(f"[STOCK] Successfully restored stock for order {order['order_number']} ({reason})")
        return True
        
    except Exception as e:
        connection.rollback()
        print(f"[STOCK] Error restoring stock for order {order_id}: {str(e)}")
        return False
        
    finally:
        cursor.close()
        connection.close()

def get_time_ago(created_at):
    """Get human-readable time ago string"""
    if not created_at:
        return "Unknown"
    
    now = datetime.now()
    diff = now - created_at
    
    seconds = diff.total_seconds()
    
    if seconds < 60:
        return "Just now"
    elif seconds < 3600:
        minutes = int(seconds / 60)
        return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
    elif seconds < 86400:
        hours = int(seconds / 3600)
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    elif seconds < 604800:
        days = int(seconds / 86400)
        return f"{days} day{'s' if days != 1 else ''} ago"
    else:
        weeks = int(seconds / 604800)
        return f"{weeks} week{'s' if weeks != 1 else ''} ago"

def validate_status_transition(current_status, new_status, user_role):
    """
    Validate order status transitions based on business rules
    Returns (is_valid, error_message)
    """
    # Define valid status transitions
    status_flow = {
        'pending': ['confirmed', 'cancelled'],
        'confirmed': ['prepared', 'cancelled'],
        'prepared': ['shipped', 'cancelled'],
        'shipped': ['delivered'],  # Only riders can set to delivered
        'delivered': [],  # Final state
        'cancelled': []   # Final state
    }
    
    # Role-based restrictions
    if user_role == 'seller':
        # Sellers can only move forward in the workflow, not set delivered
        if new_status == 'delivered':
            return False, "Only riders/couriers can mark orders as delivered"
        
        # Check if the transition is valid for sellers
        valid_transitions = status_flow.get(current_status, [])
        if new_status not in valid_transitions:
            return False, f"Cannot change status from {current_status} to {new_status}"
        
        # Sellers cannot cancel after shipped
        if current_status == 'shipped' and new_status == 'cancelled':
            return False, "Cannot cancel order after it has been shipped"
            
    elif user_role == 'rider':
        # Riders can only set to delivered from shipped status
        if new_status != 'delivered':
            return False, "Riders can only mark orders as delivered"
        if current_status != 'shipped':
            return False, "Order must be shipped before it can be delivered"
            
    elif user_role == 'buyer':
        # Buyers can only cancel, and only before shipped
        if new_status != 'cancelled':
            return False, "Buyers can only cancel orders"
        if current_status == 'shipped':
            return False, "Cannot cancel order after it has been shipped"
        if current_status == 'delivered':
            return False, "Cannot cancel a delivered order"
    
    return True, None

def get_valid_next_statuses(current_status, user_role):
    """Get list of valid next statuses based on current status and user role"""
    status_flow = {
        'pending': ['confirmed', 'cancelled'],
        'confirmed': ['prepared', 'cancelled'],
        'prepared': ['shipped', 'cancelled'],
        'shipped': ['delivered'],
        'delivered': [],
        'cancelled': []
    }
    
    valid_statuses = status_flow.get(current_status, [])
    
    # Filter based on user role
    if user_role == 'seller':
        # Sellers cannot set delivered or cancel shipped orders
        valid_statuses = [s for s in valid_statuses if s != 'delivered']
        if current_status == 'shipped':
            valid_statuses = [s for s in valid_statuses if s != 'cancelled']
    elif user_role == 'rider':
        # Riders can only set to delivered
        valid_statuses = ['delivered'] if current_status == 'shipped' else []
    elif user_role == 'buyer':
        # Buyers can only cancel (and only before shipped)
        valid_statuses = ['cancelled'] if current_status in ['pending', 'confirmed', 'prepared'] else []
    
    return valid_statuses
    
# Simple endpoint to validate token and return user info (used by admin.html)
@app.route('/api/auth/me', methods=['GET'])
@token_required
def api_auth_me(current_user):
    try:
        return jsonify({
            'success': True,
            'user': {
                'id': current_user.get('id'),
                'name': current_user.get('name'),
                'email': current_user.get('email'),
                'role': current_user.get('role')
            }
        })
    except Exception as e:
        print("api_auth_me error:", e)
        return jsonify({'error': 'Failed to return user info'}), 500

@app.route('/api/auth/verify', methods=['GET'])
def verify_token():
    token = None
    if 'Authorization' in request.headers:
        try:
            token = request.headers['Authorization'].split(" ")[1]
        except IndexError:
            return jsonify({'error': 'Invalid authorization header'}), 401

    if not token:
        return jsonify({'error': 'Token is missing'}), 401

    try:
        data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
        
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute('SELECT * FROM users WHERE id = %s AND role = "seller"', 
                      (data.get('user_id'),))
        user = cursor.fetchone()
        cursor.close()
        connection.close()

        if not user:
            return jsonify({'error': 'User not found or not a seller'}), 403

        return jsonify({
            'success': True,
            'user': {
                'id': user['id'],
                'email': user['email'],
                'role': user['role']
            }
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 401

def generate_verification_code():
    """Generate a 6-digit verification code"""
    return ''.join([str(random.randint(0, 9)) for _ in range(6)])

def send_verification_email(to_email, verification_code, user_name="User"):
    """
    Send email verification code to user
    """
    try:
        if not EMAIL_ADDRESS or not EMAIL_PASSWORD:
            print("[EMAIL] Email configuration missing")
            return False
            
        message = MIMEMultipart("alternative")
        message["Subject"] = "Verify Your Grande Account"
        message["From"] = f"Grande <{EMAIL_ADDRESS}>"
        message["To"] = to_email
        
        # HTML email template
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {{
                    font-family: 'Inter', Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .container {{
                    background: #ffffff;
                    border-radius: 10px;
                    padding: 40px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }}
                .header {{
                    text-align: center;
                    margin-bottom: 30px;
                }}
                .logo {{
                    font-family: 'Playfair Display', serif;
                    font-size: 32px;
                    color: #2d3436;
                    margin-bottom: 10px;
                }}
                .verification-code {{
                    background: #f8f9fa;
                    border: 2px dashed #2d3436;
                    border-radius: 8px;
                    padding: 20px;
                    text-align: center;
                    margin: 30px 0;
                }}
                .code {{
                    font-size: 36px;
                    font-weight: bold;
                    letter-spacing: 8px;
                    color: #2d3436;
                    font-family: 'Courier New', monospace;
                }}
                .message {{
                    font-size: 16px;
                    color: #636e72;
                    text-align: center;
                    margin: 20px 0;
                }}
                .warning {{
                    background: #fff3cd;
                    border-left: 4px solid #ffc107;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 4px;
                }}
                .footer {{
                    text-align: center;
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #e9ecef;
                    color: #6c757d;
                    font-size: 14px;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">Grande</div>
                    <h2 style="color: #2d3436; margin: 0;">Welcome, {user_name}!</h2>
                </div>
                
                <p class="message">
                    Thank you for registering with Grande. To complete your registration and start shopping, 
                    please verify your email address using the code below:
                </p>
                
                <div class="verification-code">
                    <div class="code">{verification_code}</div>
                </div>
                
                <p class="message">
                    Enter this code on the verification page to activate your account.
                </p>
                
                <div class="warning">
                    <strong>⏰ Important:</strong> This verification code will expire in <strong>10 minutes</strong>.
                </div>
                
                <p style="color: #6c757d; font-size: 14px; text-align: center;">
                    If you didn't create an account with Grande, please ignore this email.
                </p>
                
                <div class="footer">
                    <p>© 2024 Grande. All rights reserved.</p>
                    <p>Your trusted destination for premium fashion.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Plain text version
        text_content = f"""
        Welcome to Grande, {user_name}!
        
        Your verification code is: {verification_code}
        
        Please enter this code on the verification page to complete your registration.
        This code will expire in 10 minutes.
        
        If you didn't create an account with Grande, please ignore this email.
        
        © 2024 Grande
        """
        
        part1 = MIMEText(text_content, "plain")
        part2 = MIMEText(html_content, "html")
        
        message.attach(part1)
        message.attach(part2)
        
        # Send email
        context = ssl.create_default_context()
        
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            if EMAIL_USE_TLS:
                server.starttls(context=context)
            server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
            server.send_message(message)
        
        print(f"[EMAIL] Verification email sent to {to_email}")
        return True
        
    except Exception as e:
        print(f"[EMAIL] Error sending verification email: {str(e)}")
        return False
def get_chat_conversations(current_user):
    """Helper function to get chat conversations for a user.

    This is the shared data source for the global Chat Center and header message dropdown.
    It MUST support buyers, sellers, and riders so the frontend can use a single
    `/api/chats` endpoint across roles.
    """
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        order_number = request.args.get('order_number')
        
        base_query = """
        SELECT 
            cc.*,
            COALESCE(
                (SELECT COUNT(*) 
                 FROM chat_messages cm 
                 WHERE cm.conversation_id = cc.id 
                 AND cm.is_read = FALSE 
                 AND cm.sender_id != %s), 0
            ) as unread_count,
            (SELECT cm.content 
             FROM chat_messages cm 
             WHERE cm.conversation_id = cc.id 
             ORDER BY cm.created_at DESC LIMIT 1
            ) as last_message,
            COALESCE(a.business_name, su.name, 'Shop') AS shop_name,
            u_buyer.name as buyer_name,
            u_buyer.profile_picture as buyer_profile_pic,
            u_seller.name as seller_name,
            u_seller.profile_picture as seller_profile_pic,
            u_admin.name as admin_name,
            u_admin.profile_picture as admin_profile_pic,
            u_rider.id as rider_id,
            u_rider.name as rider_name,
            u_rider.role as rider_role
        FROM chat_conversations cc
        LEFT JOIN users su ON su.id = cc.seller_id
        LEFT JOIN users u_buyer ON u_buyer.id = cc.buyer_id
        LEFT JOIN users u_seller ON u_seller.id = cc.seller_id
        LEFT JOIN users u_admin ON u_admin.id = cc.admin_id
        LEFT JOIN users u_rider ON u_rider.id = cc.rider_id
        LEFT JOIN applications a ON a.user_id = cc.seller_id AND a.status = 'approved'
        LEFT JOIN deliveries d ON d.order_id = cc.order_id
    """
        
        role = current_user.get('role')
        rider_id = request.args.get('rider_id')
        
        # Show conversations where the user is a participant (buyer, seller, or admin)
        # Riders should use their separate endpoint
        if role == 'seller':
            where_clause = " WHERE cc.seller_id = %s"
            params = [current_user['id'], current_user['id']]
        elif role == 'buyer':
            where_clause = " WHERE cc.buyer_id = %s"
            params = [current_user['id'], current_user['id']]
        elif role == 'admin':
            where_clause = " WHERE cc.admin_id = %s"
            params = [current_user['id'], current_user['id']]
            # For admin, also support filtering by rider_id
            if rider_id:
                where_clause += " AND cc.rider_id = %s"
                params.append(int(rider_id))
        else:
            # Riders and other roles should not use this endpoint
            return jsonify({'error': 'Unauthorized for this endpoint'}), 403
        
        if order_number:
            where_clause += " AND cc.order_number = %s"
            params.append(order_number)
        
        query = base_query + where_clause + " ORDER BY cc.last_message_time DESC, cc.created_at DESC"
        
        cursor.execute(query, params)
        conversations = cursor.fetchall()
        
        return jsonify({
            'success': True,
            'chats': conversations
        })
        
    except Exception as e:
        print(f"Error getting chat conversations: {str(e)}") 
        return jsonify({'error': 'Failed to get conversations'}), 500
    finally:
        cursor.close()
        connection.close()

def create_chat_conversation(current_user):
    """Helper function to create a new chat conversation"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        data = request.get_json()
        order_number = data.get('order_number')
        participant_name = data.get('participant_name')
        
        if not participant_name:
            return jsonify({'error': 'Participant name is required'}), 400
        
        order_id = None
        buyer_id = None
        seller_id = None
        
        if order_number:
            cursor.execute("""
                SELECT id, buyer_id, seller_id 
                FROM orders 
                WHERE order_number = %s
            """, (order_number,))
            
            order = cursor.fetchone()
            if order:
                order_id = order['id']
                buyer_id = order['buyer_id']
                seller_id = order['seller_id']
        
        if current_user['role'] == 'seller':
            seller_id = current_user['id']
            if not buyer_id:
                return jsonify({'error': 'Cannot create chat without order context'}), 400
        else:
            buyer_id = current_user['id']
            if not seller_id:
                return jsonify({'error': 'Cannot create chat without seller context'}), 400
        
        check_query = """
            SELECT id FROM chat_conversations 
            WHERE seller_id = %s AND buyer_id = %s
        """
        check_params = [seller_id, buyer_id]
        
        if order_id:
            check_query += " AND order_id = %s"
            check_params.append(order_id)
        
        cursor.execute(check_query, check_params)
        existing = cursor.fetchone()
        
        if existing:
            return jsonify({
                'success': True,
                'chat': {'id': existing['id']},
                'message': 'Conversation already exists'
            })
        
        cursor.execute("""
            INSERT INTO chat_conversations 
            (order_id, order_number, seller_id, buyer_id, participant_name)
            VALUES (%s, %s, %s, %s, %s)
        """, (order_id, order_number, seller_id, buyer_id, participant_name))
        
        conversation_id = cursor.lastrowid
        connection.commit()
        
        return jsonify({
            'success': True,
            'chat': {'id': conversation_id},
            'message': 'Conversation created successfully'
        })
        
    except Exception as e:
        connection.rollback()
        print(f"Error creating chat conversation: {str(e)}")
        return jsonify({'error': 'Failed to create conversation'}), 500
    finally:
        cursor.close()
        connection.close()

def get_orders(current_user):
    """Helper function to get orders for a user"""
    print(f"[DEBUG] get_orders called by user: {current_user.get('id')} role: {current_user.get('role')}")
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        if current_user['role'] == 'buyer':
            cursor.execute("""
                SELECT 
                    o.*,
                    u.name as buyer_name,
                    u.email as buyer_email,
                    u.phone as buyer_phone,
                    CONCAT(o.address, ', ', o.city, ' ', o.postal_code, ', ', o.country) as shipping_address
                FROM orders o
                LEFT JOIN users u ON o.buyer_id = u.id
                WHERE o.buyer_id = %s
                ORDER BY o.created_at DESC
            """, (current_user['id'],))
        elif current_user['role'] == 'seller':
            cursor.execute("""
                SELECT DISTINCT
                    o.*,
                    u.name as buyer_name,
                    u.email as buyer_email,
                    u.phone as buyer_phone,
                    CONCAT(o.address, ', ', o.city, ' ', o.postal_code, ', ', o.country) as shipping_address
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                LEFT JOIN users u ON o.buyer_id = u.id
                WHERE p.seller_id = %s
                ORDER BY o.created_at DESC
            """, (current_user['id'],))
        else:
            return jsonify({'error': 'Unauthorized role'}), 403

        orders = cursor.fetchall()
        print(f"[DEBUG] Found {len(orders)} orders for {current_user.get('role')}")
        
        # Get detailed items for each order with seller information
        detailed_orders = []
        for order in orders:
            # Get items (filtered by seller for seller role)
            if current_user['role'] == 'seller':
                cursor.execute("""
                    SELECT 
                        oi.*,
                        p.name as product_name,
                        COALESCE((SELECT pvi.image_url FROM product_variant_images pvi WHERE pvi.product_id = p.id ORDER BY pvi.display_order ASC, pvi.id ASC LIMIT 1), p.image_url) as image_url,
                        p.seller_id,
                        u.name as seller_name,
                        u.email as seller_email,
                        u.phone as seller_phone,
                        u.address as seller_address,
                        a.business_name,
                        a.business_registration
                    FROM order_items oi
                    JOIN products p ON oi.product_id = p.id
                    LEFT JOIN users u ON p.seller_id = u.id
                    LEFT JOIN applications a ON p.seller_id = a.user_id AND a.status = 'approved'
                    WHERE oi.order_id = %s AND p.seller_id = %s
                """, (order['id'], current_user['id']))
            else:
                cursor.execute("""
                    SELECT 
                        oi.*,
                        p.name as product_name,
                        COALESCE((SELECT pvi.image_url FROM product_variant_images pvi WHERE pvi.product_id = p.id ORDER BY pvi.display_order ASC, pvi.id ASC LIMIT 1), p.image_url) as image_url,
                        p.seller_id,
                        u.name as seller_name,
                        u.email as seller_email,
                        u.phone as seller_phone,
                        u.address as seller_address,
                        a.business_name,
                        a.business_registration
                    FROM order_items oi
                    JOIN products p ON oi.product_id = p.id
                    LEFT JOIN users u ON p.seller_id = u.id
                    LEFT JOIN applications a ON p.seller_id = a.user_id AND a.status = 'approved'
                    WHERE oi.order_id = %s
                """, (order['id'],))

            items = cursor.fetchall()

            # Format order data with seller information
            detailed_order = {
                'id': order['id'],
                'order_number': order['order_number'],
                'status': order['status'],
                'cancel_reason': order.get('cancel_reason'),
                'payment_status': order.get('payment_status', 'pending'),
                'payment_method': order.get('payment_method'),
                'total_amount': float(order['total_amount']),
                'created_at': order['created_at'].isoformat() if order.get('created_at') else None,
                'tracking_number': order.get('tracking_number'),
                'special_notes': order.get('special_notes', ''),

                'customer_name': order.get('full_name') or order.get('buyer_name'),
                'buyer': {
                    'name': order.get('buyer_name', 'N/A'),
                    'full_name': order.get('full_name') or order.get('buyer_name', 'N/A'),
                    'email': order.get('buyer_email', 'N/A'),
                    'phone': order.get('buyer_phone', 'N/A')
                },
                'shipping': {
                    'address': order.get('address', ''),
                    'city': order.get('city', ''),
                    'postal_code': order.get('postal_code', ''),
                    'country': order.get('country', 'Philippines'),
                    'full_address': order.get('shipping_address', '')
                },
                'items': [{
                    'id': item['id'],
                    'product_id': item['product_id'],
                    'name': item['product_name'],
                    'quantity': item['quantity'],
                    'price': float(item['price']),
                    'subtotal': float(item['price'] * item['quantity']),
                    'image_url': item.get('image_url') or '',
                    'size': item.get('size', ''),
                    'color': item.get('color', ''),
                    'seller_name': item.get('seller_name', 'Unknown Seller'),
                    'seller_info': {
                        'business_name': item.get('business_name', 'N/A'),
                        'business_registration': item.get('business_registration', 'N/A'),
                        'address': item.get('seller_address', 'N/A'),
                        'phone': item.get('seller_phone', 'N/A'),
                        'email': item.get('seller_email', 'N/A')
                    }
                } for item in items],
                'customer_email': order.get('buyer_email'),
                'customer_phone': order.get('buyer_phone')
            }
            
            detailed_orders.append(detailed_order)

        return jsonify({
            'success': True,
            'orders': detailed_orders
        })

    except Exception as e:
        print(f"Error fetching orders: {str(e)}")
        return jsonify({'error': 'Failed to fetch orders'}), 500
    finally:
        cursor.close()
        connection.close()
        
def send_password_reset_email(to_email, reset_token, user_name="User"):
    """
    Send password reset email to user
    """
    try:
        if not EMAIL_ADDRESS or not EMAIL_PASSWORD:
            print("[EMAIL] Email configuration missing")
            return False
            
        message = MIMEMultipart("alternative")
        message["Subject"] = "Reset Your Grande Password"
        message["From"] = f"Grande Fashion <{EMAIL_ADDRESS}>"
        message["To"] = to_email
        
        # Create the reset URL dynamically based on the current request host
        try:
            reset_url = url_for('serve_reset_password', _external=True) + f"?token={reset_token}"
        except Exception:
            # Fallback if no request context is available
            reset_url = f"http://localhost:5000/reset-password?token={reset_token}"
        
        # HTML email content
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Reset Your Password</title>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }}
                .container {{ background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }}
                .header {{ text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #f1f3f4; }}
                .logo {{ width: 60px; height: 60px; background: linear-gradient(135deg, #ff00ff, #ff1493); border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; color: white; font-size: 24px; font-weight: bold; margin-bottom: 15px; }}
                .title {{ color: #1a1a2e; font-size: 28px; font-weight: 700; margin: 0; }}
                .greeting {{ font-size: 18px; font-weight: 600; color: #2c3e50; margin-bottom: 20px; }}
                .message {{ font-size: 16px; color: #555; margin-bottom: 25px; }}
                .reset-button {{ display: inline-block; background: linear-gradient(135deg, #ff00ff, #ff1493); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; }}
                .security-notice {{ background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 15px; margin: 25px 0; }}
                .footer {{ text-align: center; padding-top: 30px; border-top: 1px solid #e9ecef; color: #6c757d; font-size: 14px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">G</div>
                    <h1 class="title">Grande</h1>
                </div>
                <div class="greeting">Hello {user_name},</div>
                <div class="message">We received a request to reset your password. Click the button below to reset it:</div>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{reset_url}" class="reset-button">Reset My Password</a>
                </div>
                <div class="security-notice">
                    <strong>⏰ This link expires in 1 hour</strong> for your security.
                </div>
                <div class="message">If you didn't request this, you can safely ignore this email.</div>
                <div class="footer">
                    <p>© 2025 Grande. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Plain text version
        text_content = f"""
        Hello {user_name},
        
        We received a request to reset your Grande password.
        
        Click this link to reset your password:
        {reset_url}
        
        This link expires in 1 hour for security.
        
        If you didn't request this, you can ignore this email.
        
        Best regards,
        The Grande Team
        """
        
        # Create MIME parts
        text_part = MIMEText(text_content, "plain")
        html_part = MIMEText(html_content, "html")
        
        message.attach(text_part)
        message.attach(html_part)
        
        # Send email
        context = ssl.create_default_context()
        
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            if EMAIL_USE_TLS:
                server.starttls(context=context)
            server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
            server.send_message(message)
        
        print(f"[EMAIL] Password reset email sent to {to_email}")
        return True
        
    except Exception as e:
        print(f"[EMAIL] Failed to send reset email to {to_email}: {str(e)}")
        return False

def send_registration_received_email(to_email, user_name="User"):
    """Send email to user after registration to confirm submission and pending approval."""
    try:
        if not EMAIL_ADDRESS or not EMAIL_PASSWORD:
            print("[EMAIL] Email configuration missing")
            return False
        message = MIMEMultipart("alternative")
        message["Subject"] = "Welcome to Grande - Registration Received"
        message["From"] = f"Grande <{EMAIL_ADDRESS}>"
        message["To"] = to_email

        try:
            home_url = url_for('serve_index', _external=True)
        except Exception:
            home_url = "http://localhost:5000/"

        html = f"""
        <html>
          <body style='font-family: Arial, sans-serif; color:#333;'>
            <h2 style='color:#2d3436;'>Hello {user_name},</h2>
            <p>Thanks for registering with Grande. Your account is <strong>pending admin approval</strong>.</p>
            <p>We'll notify you by email once your account is approved or rejected.</p>
            <p><a href='{home_url}' style='background:#2d3436;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;'>Visit Grande</a></p>
            <p style='font-size:12px;color:#777;'>If you did not register, please ignore this message.</p>
          </body>
        </html>
        """
        text = f"""
        Hello {user_name},

        Thanks for registering with Grande. Your account is pending admin approval.
        We'll notify you by email once your account is approved or rejected.

        {home_url}
        """
        message.attach(MIMEText(text, "plain"))
        message.attach(MIMEText(html, "html"))

        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            if EMAIL_USE_TLS:
                server.starttls(context=ssl.create_default_context())
            server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
            server.send_message(message)
        print(f"[EMAIL] Registration received email sent to {to_email}")
        return True
    except Exception as e:
        print(f"[EMAIL] Failed to send registration received email to {to_email}: {e}")
        return False

def send_admin_decision_email(to_email, decision, user_name="User", reason=None):
    """Send an email to inform the user that an admin approved or rejected their account."""
    try:
        if not EMAIL_ADDRESS or not EMAIL_PASSWORD:
            print("[EMAIL] Email configuration missing")
            return False

        is_approved = (str(decision).lower() == 'approved')
        subject = "Your Grande account has been approved" if is_approved else "Your Grande account application was rejected"

        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = f"Grande <{EMAIL_ADDRESS}>"
        message["To"] = to_email

        # Build HTML/text bodies
        if is_approved:
            body_html = f"""
            <!DOCTYPE html>
            <html>
              <head><meta charset=\"UTF-8\"></head>
              <body style=\"font-family: Arial, sans-serif; color:#333;\">
                <h2 style=\"color:#2d3436;\">Welcome to Grande, {user_name}!</h2>
                <p>Your account has been <strong>approved</strong> by our admin team. You can now log in and start using your account.</p>
                <p><a href=\"{url_for('serve_index', _external=True)}\" style=\"background:#2d3436;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;\">Go to Grande</a></p>
                <p style=\"font-size:12px;color:#777;\">If you did not initiate this request, please contact support.</p>
              </body>
            </html>
            """
            body_text = f"""
            Welcome to Grande, {user_name}!

            Your account has been approved by our admin team.
            You can now log in and start using your account: {url_for('serve_index', _external=True)}
            """
        else:
            reason_text = f"Reason: {reason}" if reason else ""
            body_html = f"""
            <!DOCTYPE html>
            <html>
              <head><meta charset=\"UTF-8\"></head>
              <body style=\"font-family: Arial, sans-serif; color:#333;\">
                <h2 style=\"color:#2d3436;\">Account Application Update</h2>
                <p>Hi {user_name},</p>
                <p>We regret to inform you that your account application has been <strong>rejected</strong>.</p>
                {f'<p style=\"color:#555;\">{reason_text}</p>' if reason_text else ''}
                <p>You may re-apply in the future. If you believe this was a mistake, please reply to this email.</p>
              </body>
            </html>
            """
            body_text = f"""
            Hi {user_name},

            Your account application has been rejected. {reason_text}
            You may re-apply in the future or contact support if you believe this was a mistake.
            """

        part_text = MIMEText(body_text, "plain")
        part_html = MIMEText(body_html, "html")
        message.attach(part_text)
        message.attach(part_html)

        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            if EMAIL_USE_TLS:
                server.starttls(context=ssl.create_default_context())
            server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
            server.send_message(message)

        print(f"[EMAIL] Admin decision email ({decision}) sent to {to_email}")
        return True
    except Exception as e:
        print(f"[EMAIL] Failed to send admin decision email to {to_email}: {e}")
        return False

def send_order_confirmation_email(order_id):
    """Send an order confirmation email to the buyer with order details."""
    try:
        if not EMAIL_ADDRESS or not EMAIL_PASSWORD:
            print("[EMAIL] Email configuration missing")
            return False

        # Fetch order + buyer info + items
        connection = get_db_connection()
        if not connection:
            return False
        cursor = connection.cursor(dictionary=True)
        try:
            cursor.execute(
                """
                SELECT o.*, u.name AS buyer_name, u.email AS buyer_email
                FROM orders o
                LEFT JOIN users u ON u.id = o.buyer_id
                WHERE o.id = %s
                """,
                (order_id,)
            )
            order = cursor.fetchone()
            if not order:
                print(f"[EMAIL] Order {order_id} not found for confirmation email")
                return False

            cursor.execute(
                """
                SELECT 
                    oi.product_name, oi.quantity, oi.price, oi.size, oi.color,
                    COALESCE((SELECT pvi.image_url FROM product_variant_images pvi WHERE pvi.product_id = p.id ORDER BY pvi.display_order ASC, pvi.id ASC LIMIT 1), p.image_url) AS image_url
                FROM order_items oi
                JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = %s
                ORDER BY oi.id ASC
                """,
                (order_id,)
            )
            items = cursor.fetchall() or []
        finally:
            cursor.close(); connection.close()

        order_number = order.get('order_number')
        full_name = (order.get('full_name') or order.get('buyer_name') or 'Customer')
        to_email = (order.get('email') or order.get('buyer_email'))
        if not to_email:
            print(f"[EMAIL] No recipient email for order {order_number}")
            return False

        # Build items HTML rows with images
        def esc(s):
            return (str(s or '')).replace('<','&lt;').replace('>','&gt;')
        item_rows = []
        for idx, it in enumerate(items):
            qty = int(it.get('quantity') or 0)
            price = float(it.get('price') or 0)
            subtotal_item = qty * price
            img = it.get('image_url') or 'https://via.placeholder.com/70x70/f8f9fa/6c757d?text=IMG'
            variant = (it.get('size') or '')
            if it.get('color'):
                variant = f"{variant} / {it.get('color')}" if variant else str(it.get('color'))
            row_bg = '#fafbfc' if (idx % 2 == 0) else '#ffffff'
            item_rows.append(
                f"<div style='padding:12px 0;border-bottom:1px solid #eee;background:{row_bg};'>"
                f"  <table role='presentation' width='100%' cellspacing='0' cellpadding='0' border='0' style='border-collapse:collapse;'>"
                f"    <tr>"
                f"      <td width='64' valign='top' style='padding-right:10px'>"
                f"        <img src='{img}' alt='' style='width:64px;height:64px;border-radius:8px;object-fit:cover;border:1px solid #eee' onerror=\"this.src='https://via.placeholder.com/64'\">"
                f"      </td>"
                f"      <td valign='top' style='font-size:13px;color:#222;'>"
                f"        <div style='font-weight:600'>{esc(it.get('product_name'))}</div>"
                f"        <div style='color:#6c757d;font-size:12px'>{esc(variant)}</div>"
                f"        <div style='margin-top:6px;display:flex;justify-content:space-between;'>"
                f"          <span>Qty: {qty}</span>"
                f"          <span>₱{price:.2f} · Subtotal: ₱{subtotal_item:.2f}</span>"
                f"        </div>"
                f"      </td>"
                f"    </tr>"
                f"  </table>"
                f"</div>"
            )
        rows_html = "".join(item_rows)

        subtotal = sum((float(it.get('price') or 0) * int(it.get('quantity') or 0)) for it in items)
        total_amount = float(order.get('total_amount') or subtotal)
        shipping_calc = max(round(total_amount - subtotal, 2), 0.0)

        shipping_address = \
            f"{order.get('address','')}, {order.get('city','')} {order.get('postal_code','')}, {order.get('country','Philippines')}".strip(', ')

        # Estimate shipping window (2-5 days from created_at)
        created_at = order.get('created_at')
        try:
            est_start = (created_at + timedelta(days=2)) if created_at else None
            est_end = (created_at + timedelta(days=5)) if created_at else None
        except Exception:
            est_start = est_end = None
        def fmt_dt(dt):
            try:
                return dt.strftime('%d %b %Y')
            except Exception:
                return ''
        est_range = f"{fmt_dt(est_start)} - {fmt_dt(est_end)}" if est_start and est_end else "Within 2-5 days"

        # Payment date text (fallback to today if missing or unrealistic future date)
        now_dt = datetime.now()
        try:
            payment_date_txt = fmt_dt(created_at) if created_at else now_dt.strftime('%d %b %Y')
            if isinstance(created_at, datetime) and created_at > now_dt + timedelta(days=365):
                payment_date_txt = now_dt.strftime('%d %b %Y')
        except Exception:
            payment_date_txt = now_dt.strftime('%d %b %Y')

        subject = f"Your Grande Order {order_number} Confirmation"

        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = f"{os.getenv('BRAND_NAME', 'Grande')} <{EMAIL_ADDRESS}>"
        message["To"] = to_email

        # Build a track URL (best-effort)
        base_url = os.getenv('PUBLIC_BASE_URL', 'http://localhost:5000')
        track_url = f"{base_url}/Public/order_summary.html?order_number={order_number}"

        # Theme variables (align with site theme, overridable via env)
        brand_name = os.getenv('BRAND_NAME', 'Grande')
        color_primary = os.getenv('BRAND_PRIMARY', '#FF2BAC')
        color_accent = os.getenv('BRAND_ACCENT', '#FF6BCE')
        color_secondary = os.getenv('BRAND_SECONDARY', '#1B0E24')
        bg_light = os.getenv('BRAND_BG_LIGHT', '#F7F6FB')
        text_color = os.getenv('BRAND_TEXT', '#2A2A2A')
        container_bg = os.getenv('BRAND_CONTAINER_BG', '#FFFFFF')
        border_color = os.getenv('BRAND_BORDER', '#E6E2EE')
        gradient = os.getenv('BRAND_GRADIENT') or f"linear-gradient(135deg, {color_primary} 0%, {color_accent} 60%, #FF9ED6 100%)"
        logo_url = os.getenv('BRAND_LOGO_URL') or f"{base_url}/static/image.png"
        support_email = os.getenv('SUPPORT_EMAIL') or EMAIL_ADDRESS or 'support@example.com'

        html_content = f"""
        <!DOCTYPE html>
        <html>
          <head><meta charset=\"UTF-8\"></head>
          <body style=\"margin:0; background:{bg_light}; font-family:Inter, Arial, Helvetica, sans-serif; color:{text_color};\">
            <div style=\"display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;\">Order {order_number} confirmed — Total ₱{total_amount:.2f}</div>
            <div style=\"max-width:680px;margin:0 auto;padding:24px;\">
              <div style=\"text-align:center;margin-bottom:16px;\">
                <img src=\"{logo_url}\" alt=\"{brand_name}\" style=\"height:28px; max-width:180px; object-fit:contain;\" />
                <div style=\"width:70px;height:2px;background:{text_color};margin:10px auto 0;opacity:.2\"></div>
                <div style=\"margin-top:10px;display:inline-block;background:{bg_light};border:1px solid {border_color};color:{color_secondary};padding:6px 10px;border-radius:999px;font-weight:600;font-size:12px;\">Order #{esc(order_number)}</div>
              </div>

              <div style=\"background:{container_bg};border:1px solid {border_color};border-radius:12px;overflow:hidden;\">
                <div style=\"padding:22px 26px;text-align:center;\">
                  <h2 style=\"margin:0 0 6px 0;font-size:20px;color:{color_secondary};font-family: 'Playfair Display', Georgia, serif;\">Dear {esc(full_name)},</h2>
                  <p style=\"margin:0;color:#6c757d;font-size:13px;\">Thank you for your order! We hope you enjoy shopping with us.</p>
                  <a href=\"{track_url}\" style=\"display:inline-block;margin-top:14px;background:{gradient};color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:700;box-shadow:0 0 16px rgba(255, 43, 172, 0.25);\">Order information</a>
                </div>

                <div style=\"padding:0 26px 12px 26px;\">\n                  <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"border-collapse:collapse;\">\n                    <tr>\n                      <td align=\"center\" style=\"font-size:12px;color:{color_secondary};opacity:.8;\">\n                        <span style=\"display:inline-block;min-width:80px;padding:6px 10px;border-radius:999px;background:{bg_light};border:1px solid {border_color};font-weight:700;color:{color_secondary};\">Pending</span>\n                        <span style=\"display:inline-block;width:36px;height:2px;background:{border_color};vertical-align:middle;margin:0 6px;\"></span>\n                        <span style=\"display:inline-block;min-width:80px;padding:6px 10px;border-radius:999px;background:#f1f3f5;border:1px solid {border_color};color:{color_secondary};\">Processing</span>\n                        <span style=\"display:inline-block;width:36px;height:2px;background:{border_color};vertical-align:middle;margin:0 6px;\"></span>\n                        <span style=\"display:inline-block;min-width:80px;padding:6px 10px;border-radius:999px;background:#f1f3f5;border:1px solid {border_color};color:{color_secondary};\">Shipped</span>\n                      </td>\n                    </tr>\n                  </table>\n                </div>\n\n                <div style=\"padding:0 26px 6px 26px;display:grid;grid-template-columns:1fr 1fr;gap:10px;\">
                  <div style=\"font-size:13px;line-height:1.6;\">
                    <div><strong>Order number:</strong><br>{esc(order_number)}</div>
                    <div style=\"margin-top:8px;\"><strong>Shipping Method:</strong><br>Standard Shipping</div>
                    <div style=\"margin-top:8px;\"><strong>Shipping address:</strong><br>{esc(shipping_address)}</div>
                  </div>
                  <div style=\"font-size:13px;line-height:1.6;\">
                    <div><strong>Total Amount:</strong><br>₱{total_amount:.2f}</div>
                    <div style=\"margin-top:8px;\"><strong>Payment Method:</strong><br>{esc(order.get('payment_method'))}</div>
                    <div style=\"margin-top:8px;\"><strong>Payment Date:</strong><br>{payment_date_txt}</div>
                  </div>
                </div>

                <div style=\"padding:0 26px 16px 26px;font-size:13px;\">
                  <div style=\"margin-top:8px;\"><strong>Estimated shipping time:</strong><br>{est_range}</div>
                </div>

                <div style=\"background:{color_secondary};color:#fff;padding:10px 26px;font-weight:700;\">Order Summary:</div>
                <div style=\"padding:0 26px;\">
                  {rows_html}
                </div>

                <div style=\"padding:10px 26px 20px 26px;\">
                  <div style=\"background:#f8f9fa;border:1px solid {border_color};border-radius:10px;padding:12px 14px;max-width:340px;margin-left:auto;\">
                    <div style=\"display:flex;justify-content:space-between;font-size:13px;margin:4px 0;\"><span>Sub Total:</span><strong>₱{subtotal:.2f}</strong></div>
                    <div style=\"display:flex;justify-content:space-between;font-size:13px;margin:4px 0;\"><span>Shipping:</span><strong>₱{shipping_calc:.2f}</strong></div>
                    <div style=\"display:flex;justify-content:space-between;font-size:13px;margin:4px 0;\"><span>Discount:</span><strong>₱0.00</strong></div>
                    <div style=\"height:1px;background:#e9ecef;margin:8px 0;\"></div>
                    <div style=\"display:flex;justify-content:space-between;font-size:14px;margin:4px 0;\"><span style=\"font-weight:700;\">Total:</span><span style=\"font-weight:800;\">₱{total_amount:.2f}</span></div>
                  </div>
                </div>

                <div style=\"padding:0 26px 10px 26px;text-align:center;\">\n                  <a href=\"{track_url}\" style=\"display:inline-block;margin:8px 6px;background:{gradient};color:#fff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:700;\">View order</a>\n                  <a href=\"{base_url}/Public/market.html\" style=\"display:inline-block;margin:8px 6px;background:transparent;color:{color_secondary};text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:700;border:1px solid {border_color};\">Continue shopping</a>\n                </div>\n\n                <div style=\"padding:0 26px 22px 26px;color:#6c757d;font-size:12px;\">
                  Track your order anytime in My Orders on your {brand_name} account or via the button above. Need help? Contact {support_email} or just reply to this email.
                </div>
              </div>
            </div>
          </body>
        </html>
        """
        text_content = (
            f"Order {order_number}\n"
            f"Total: ₱{total_amount:.2f}\n"
            f"Payment: {order.get('payment_method')}\n"
            f"Ship to: {shipping_address}\n"
            f"Estimated: {est_range}\n\n" +
            "Items:\n" +
            "\n".join([
                f"- {it.get('product_name')} x{int(it.get('quantity') or 0)} @ ₱{float(it.get('price') or 0):.2f}"
                for it in items
            ])
        )

        message.attach(MIMEText(text_content, "plain"))
        message.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            if EMAIL_USE_TLS:
                server.starttls(context=ssl.create_default_context())
            server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
            server.send_message(message)
        print(f"[EMAIL] Order confirmation sent for {order_number} to {to_email}")
        return True
    except Exception as e:
        print(f"[EMAIL] Failed to send order confirmation for order_id={order_id}: {e}")
        return False

def generate_reset_token():
    """Generate a secure random token for password reset"""
    return secrets.token_urlsafe(32)

def create_password_reset_token(user_id):
    """Create a password reset token for user"""
    connection = get_db_connection()
    if not connection:
        return None
        
    cursor = connection.cursor()
    
    try:
        # Generate token
        token = generate_reset_token()
        
        # Set expiration time (1 hour from now)
        expires_at = datetime.now() + timedelta(hours=1)
        
        # Store token in database
        cursor.execute("""
            INSERT INTO password_reset_tokens (user_id, token, expires_at)
            VALUES (%s, %s, %s)
        """, (user_id, token, expires_at))
        
        connection.commit()
        cursor.close()
        connection.close()
        
        return token
        
    except Exception as e:
        print(f"[PASSWORD_RESET] Error creating token: {str(e)}")
        connection.rollback()
        cursor.close()
        connection.close()
        return None

def verify_reset_token(token):
    """Verify password reset token and return user_id if valid"""
    connection = get_db_connection()
    if not connection:
        return None
        
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get token details
        cursor.execute("""
            SELECT user_id, expires_at, used
            FROM password_reset_tokens
            WHERE token = %s
        """, (token,))
        
        token_data = cursor.fetchone()
        
        if not token_data:
            return None
            
        if token_data['used']:
            return None
            
        if datetime.now() > token_data['expires_at']:
            return None
            
        return token_data['user_id']
        
    except Exception as e:
        print(f"[PASSWORD_RESET] Error verifying token: {str(e)}")
        return None
    finally:
        cursor.close()
        connection.close()

def mark_token_as_used(token):
    """Mark reset token as used"""
    connection = get_db_connection()
    if not connection:
        return False
        
    cursor = connection.cursor()
    
    try:
        cursor.execute("""
            UPDATE password_reset_tokens 
            SET used = 1 
            WHERE token = %s
        """, (token,))
        
        connection.commit()
        cursor.close()
        connection.close()
        return True
        
    except Exception as e:
        print(f"[PASSWORD_RESET] Error marking token as used: {str(e)}")
        cursor.close()
        connection.close()
        return False

@app.route('/api/auth/register', methods=['POST'])
def register():
    # Handle both JSON and multipart/form-data
    if request.content_type and 'multipart/form-data' in request.content_type:
        data = request.form.to_dict()
    else:
        data = request.get_json(silent=True) or {}
        if not data:
            try:
                data = request.form.to_dict(flat=True)
            except Exception:
                data = {}

    # Preserve multi-value fields (e.g., categories) if form-data was submitted
    categories = []
    if request.method == 'POST' and request.content_type and 'multipart/form-data' in request.content_type.lower():
        try:
            categories = request.form.getlist('categories[]')
        except Exception:
            categories = []
    else:
        raw_categories = data.get('categories') or data.get('categories[]')
        if isinstance(raw_categories, list):
            categories = [c for c in raw_categories if c]
        elif isinstance(raw_categories, str) and raw_categories.strip():
            categories = [raw_categories.strip()]

    # Normalize common frontend field aliases
    if 'confirm_password' not in data and 'confirmPassword' in data:
        data['confirm_password'] = data.get('confirmPassword')
    if 'email' in data and isinstance(data['email'], str):
        data['email'] = data['email'].strip().lower()
    
    # Combine name fields if separate fields are provided
    if 'firstName' in data and 'lastName' in data:
        first_name = data.get('firstName', '').strip()
        middle_name = data.get('middleName', '').strip()
        last_name = data.get('lastName', '').strip()
        
        # Construct full name
        name_parts = [first_name]
        if middle_name:
            name_parts.append(middle_name)
        name_parts.append(last_name)
        data['name'] = ' '.join(name_parts)

    # Validate required fields
    required_fields = ['name', 'email', 'password', 'confirm_password']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'Missing {field}'}), 400

    if data['password'] != data['confirm_password']:
        return jsonify({'error': 'Passwords do not match'}), 400

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor()

    # Check if email exists
    cursor.execute("SELECT id, status FROM users WHERE email = %s", (data['email'],))
    existing_user = cursor.fetchone()
    if existing_user:
        cursor.close()
        connection.close()
        return jsonify({'error': 'Email already exists'}), 400

    try:
        # Get required fields
        phone = data.get('phone', '')
        gender = data.get('gender', None)
        suffix = data.get('suffix', '').strip() or None
        birthday = data.get('birthday', '').strip() or None
        
        # Validate birthday (no future dates)
        if birthday:
            try:
                bday_date = datetime.strptime(birthday, "%Y-%m-%d").date()
                if bday_date > datetime.now().date():
                    return jsonify({'error': 'Birthday cannot be in the future'}), 400
                # normalize to ISO format
                birthday = bday_date.isoformat()
            except Exception:
                return jsonify({'error': 'Invalid birthday format. Use YYYY-MM-DD.'}), 400
        
        # Build complete address from components
        region_name = data.get('region', '')
        province_name = data.get('province', '')
        city_name = data.get('city', '')
        barangay_name = data.get('barangay', '')
        street = data.get('street', '')
        postal_code = data.get('postalCode', '')
        region_code = data.get('region_code') or data.get('regionCode') or data.get('region_code_id') or data.get('regionCodeId')
        province_code = data.get('province_code') or data.get('provinceCode')
        city_code = data.get('city_code') or data.get('cityCode')
        barangay_code = data.get('barangay_code') or data.get('barangayCode')
        
        # Check if the values are codes (numeric) and use text labels if available
        # Helper function to check if a value is a code
        def is_code(value):
            if not value:
                return False
            value_str = str(value).strip()
            # Check if it's purely numeric (a code)
            return value_str.isdigit() and len(value_str) >= 2
        
        # If region/province/city/barangay are codes, they should already be replaced by text labels
        # from the hidden fields. But if they're still codes, prefer the text labels from the form.
        # The form should send both: region (text) and region_code (code)
        # So if region is a code, it means the form didn't send the text label properly
        
        # Use the address field if provided (it should already have text labels)
        # Otherwise, construct from components
        if data.get('address'):
            address = data.get('address')
        else:
            # Construct full address from components, using text labels (not codes)
            address_parts = []
            if street: address_parts.append(street)
            # Only add if it's not a code (text label)
            if barangay_name and not is_code(barangay_name):
                address_parts.append(barangay_name)
            if city_name and not is_code(city_name):
                address_parts.append(city_name)
            if province_name and not is_code(province_name):
                address_parts.append(province_name)
            if region_name and not is_code(region_name):
                address_parts.append(region_name)
            if postal_code: address_parts.append(postal_code)
            
            address = ', '.join(address_parts)
        
        # Append suffix to display name (e.g., "John Q. Public, Jr.") while also storing separately
        if data.get('name') and suffix:
            data['name'] = f"{data['name']}, {suffix}"
        
        # Handle ID document upload if present (front/back)
        id_document_path = None  # legacy single
        id_front_url = None
        id_back_url = None
        license_document_url = None
        license_front_url = None
        license_back_url = None
        # Initialize business document variables
        business_registration_doc_url = None
        tax_registration_doc_url = None
        business_permit_doc_url = None
        # Initialize OR/CR document variables for riders
        or_document_url = None
        cr_document_url = None
        if request.content_type and 'multipart/form-data' in (request.content_type or '').lower():
            from werkzeug.utils import secure_filename
            import time
            id_docs_folder = os.path.join(app.static_folder, 'uploads', 'id_documents')
            os.makedirs(id_docs_folder, exist_ok=True)

            def save_file(fileobj, prefix):
                if not fileobj or not fileobj.filename:
                    return None
                filename = secure_filename(fileobj.filename)
                ts = time.strftime('%Y%m%d_%H%M%S')
                unique = f"{prefix}_{ts}_{filename}"
                path = os.path.join(id_docs_folder, unique)
                fileobj.save(path)
                return f"/static/uploads/id_documents/{unique}"

            # Prefer new fields - check if files exist and have filenames
            id_front_file = request.files.get('id_front')
            id_back_file = request.files.get('id_back')
            
            if id_front_file and id_front_file.filename:
                id_front_url = save_file(id_front_file, 'idfront')
                print(f"[REGISTER] ID front uploaded: {id_front_url}")
            if id_back_file and id_back_file.filename:
                id_back_url = save_file(id_back_file, 'idback')
                print(f"[REGISTER] ID back uploaded: {id_back_url}")
            single_id_upload = (
                request.files.get('id_document') or
                request.files.get('idDocument') or
                request.files.get('sellerIdDocument') or
                request.files.get('riderIdDocument')
            )
            if single_id_upload:
                id_document_path = save_file(single_id_upload, 'idsingle')
            # Fallback to old single field (legacy)
            if not id_front_url and 'idUpload' in request.files:
                id_front_url = save_file(request.files.get('idUpload'), 'idsingle')
                id_document_path = id_front_url
            # If only one provided, keep legacy path for backward compatibility
            if id_front_url and not id_document_path:
                id_document_path = id_front_url
            # Handle license document for riders (prefer front/back, fallback to single)
            if 'license_front' in request.files:
                license_front_url = save_file(request.files.get('license_front'), 'licensefront')
            if 'license_back' in request.files:
                license_back_url = save_file(request.files.get('license_back'), 'licenseback')
            # Fallback to single license_document field
            if 'license_document' in request.files:
                license_document_url = save_file(request.files.get('license_document'), 'license')
            # Use front as main license document if available
            if license_front_url and not license_document_url:
                license_document_url = license_front_url
            
            # Handle business documents for sellers
            if 'business_registration_doc' in request.files:
                business_registration_doc_url = save_file(request.files.get('business_registration_doc'), 'bizreg')
            if 'tax_registration_doc' in request.files:
                tax_registration_doc_url = save_file(request.files.get('tax_registration_doc'), 'taxreg')
            if 'business_permit_doc' in request.files:
                business_permit_doc_url = save_file(request.files.get('business_permit_doc'), 'bizpermit')
            
            # Handle OR/CR documents for riders
            or_document_url = None
            cr_document_url = None
            if 'or_document' in request.files:
                or_document_url = save_file(request.files.get('or_document'), 'or')
            if 'cr_document' in request.files:
                cr_document_url = save_file(request.files.get('cr_document'), 'cr')
            
            # Debug logging (commented out for production)
            # print(f"[REGISTER] ID upload - front: {id_front_url}, back: {id_back_url}, license: {license_document_url}, license_front: {license_front_url}, license_back: {license_back_url}")
            # print(f"[REGISTER] Business docs - registration: {business_registration_doc_url}, tax: {tax_registration_doc_url}, permit: {business_permit_doc_url}")
            # print(f"[REGISTER] Rider docs - OR: {or_document_url}, CR: {cr_document_url}")

        # Get role from form data (default to buyer if not provided)
        # MUST be defined before validation checks
        role = data.get('role', 'buyer').lower()
        if role not in ['buyer', 'seller', 'rider']:
            role = 'buyer'  # fallback to buyer if invalid role

        # Enforce ID documents based on role
        # For sellers and buyers, ID documents (front and back) are required
        # For riders, driver's license (front/back) is required
        if role in ['seller', 'buyer']:
            if not ((id_front_url and id_back_url) or id_document_path):
                return jsonify({'error': 'Please upload both front and back sides of your ID document.'}), 400
        elif role == 'rider':
            # Riders need driver's license (front/back required)
            # ID documents are optional for riders (driver's license serves as ID)
            if not (license_document_url or (license_front_url and license_back_url)):
                return jsonify({'error': 'Please upload your driver\'s license (front and back sides are required).'}), 400
            # Riders also need OR and CR documents
            if not (or_document_url and cr_document_url):
                return jsonify({'error': 'Please upload both Official Receipt (OR) and Certificate of Registration (CR) documents for your vehicle.'}), 400
        
        # Store password in plain text (ONLY DEV) – better: hash it with bcrypt
        # Set status to 'pending' - admin must approve before user can login
        # Build dynamic insert depending on available columns (suffix, birthday may not exist if migrations not run)
        has_suffix = False
        has_birthday = False
        try:
            cursor.execute("SHOW COLUMNS FROM users LIKE 'suffix'")
            has_suffix = cursor.fetchone() is not None
        except Exception:
            has_suffix = False
        try:
            cursor.execute("SHOW COLUMNS FROM users LIKE 'birthday'")
            has_birthday = cursor.fetchone() is not None
        except Exception:
            has_birthday = False
        
        # Handle role-specific additional fields
        additional_info = {}
        if role == 'seller':
            additional_info = {
                'business_name': data.get('businessName', ''),
                'business_description': data.get('businessDescription', ''),
                'business_email': data.get('businessEmail', ''),
                'business_phone': data.get('businessPhone', ''),
                'website': data.get('website', ''),
                'business_registration_doc': business_registration_doc_url,
                'tax_registration_doc': tax_registration_doc_url,
                'business_permit_doc': business_permit_doc_url
            }
            # Validate that all business documents are provided
            if not (business_registration_doc_url and tax_registration_doc_url and business_permit_doc_url):
                return jsonify({'error': 'Please upload all required business documents: Business Registration, Tax Registration, and Business Permit.'}), 400
        elif role == 'rider':
            additional_info = {
                'vehicle_type': data.get('vehicleType', ''),
                'license_number': data.get('licenseNumber', ''),
                'license_expiry': data.get('licenseExpiry', ''),
                'vehicle_make_model': data.get('vehicleMakeModel', ''),
                'experience_description': data.get('experienceDescription', ''),
                'license_document': license_document_url,
                'license_front': license_front_url,
                'license_back': license_back_url,
                'or_document': or_document_url,
                'cr_document': cr_document_url
            }
            # Include address components if provided (new format)
            if address:
                additional_info['address'] = address
            if region_name:
                additional_info['region'] = region_name
            if province_name:
                additional_info['province'] = province_name
            if city_name:
                additional_info['city'] = city_name
            if barangay_name:
                additional_info['barangay'] = barangay_name
            if street:
                additional_info['street'] = street
            if postal_code:
                additional_info['postal_code'] = postal_code
        
        if categories:
            additional_info.setdefault('categories', categories)
            additional_info.setdefault('primary_category', categories[0])
        
        # Store additional info as JSON in address field (combine with regular address)
        import json
        address_data = {
            'address': address,
            'region': region_name,
            'region_code': region_code,
            'province': province_name,
            'province_code': province_code,
            'city': city_name,
            'city_code': city_code,
            'barangay': barangay_name,
            'barangay_code': barangay_code,
            'postal_code': postal_code,
            'street': street
        }
        if additional_info:
            address_data['additional_info'] = additional_info
        address_json = json.dumps(address_data)
        
        # Get latitude and longitude from form data
        latitude = data.get('latitude')
        longitude = data.get('longitude')
        
        columns = [
            'name', 'email', 'password', 'role', 'status', 'phone', 'address', 'gender', 'id_document'
        ]
        values = [
            data['name'], data['email'], data['password'], role, 'pending', phone, address_json, gender, id_document_path
        ]
        
        # Add latitude and longitude if provided
        if latitude and longitude:
            try:
                lat_float = float(latitude)
                lng_float = float(longitude)
                columns.append('location_lat')
                columns.append('location_lng')
                values.append(lat_float)
                values.append(lng_float)
            except (ValueError, TypeError):
                print(f"Warning: Invalid lat/lng values: {latitude}, {longitude}")
        if has_suffix:
            columns.insert(1, 'suffix')
            values.insert(1, suffix)
        if has_birthday:
            # insert birthday after gender for readability (order doesn't matter)
            columns.insert(columns.index('gender') + 1, 'birthday')
            values.insert(columns.index('birthday'), birthday)

        # Ensure optional columns for front/back exist and include if present
        try:
            cursor.execute("SHOW COLUMNS FROM users LIKE 'id_document_front'")
            has_front = cursor.fetchone() is not None
        except Exception:
            has_front = False
        try:
            cursor.execute("SHOW COLUMNS FROM users LIKE 'id_document_back'")
            has_back = cursor.fetchone() is not None
        except Exception:
            has_back = False
        if not has_front and id_front_url:
            cursor.execute("ALTER TABLE users ADD COLUMN id_document_front TEXT NULL")
            has_front = True
        if not has_back and id_back_url:
            cursor.execute("ALTER TABLE users ADD COLUMN id_document_back TEXT NULL")
            has_back = True
        if id_front_url and has_front:
            columns.append('id_document_front')
            values.append(id_front_url)
        if id_back_url and has_back:
            columns.append('id_document_back')
            values.append(id_back_url)

        placeholders = ', '.join(['%s'] * len(values))
        cursor.execute(
            f"INSERT INTO users ({', '.join(columns)}) VALUES ({placeholders})",
            tuple(values)
        )

        user_id = cursor.lastrowid

        def ensure_seller_application_record():
            if not additional_info:
                return
            try:
                cursor.execute(
                    "SELECT id FROM applications WHERE user_id = %s AND application_type = 'seller' LIMIT 1",
                    (user_id,)
                )
                existing_app = cursor.fetchone()
                business_name = additional_info.get('business_name') or data.get('businessName') or data.get('name')
                business_registration_number = data.get('businessRegistrationNumber') or additional_info.get('business_registration_number')
                business_email = additional_info.get('business_email') or data.get('businessEmail') or data.get('email')
                business_phone = additional_info.get('business_phone') or data.get('businessPhone') or phone
                business_registration_doc = additional_info.get('business_registration_doc')
                business_permit_doc = additional_info.get('business_permit_doc')
                tax_registration_doc = additional_info.get('tax_registration_doc')
                experience_payload = {
                    'business_description': additional_info.get('business_description'),
                    'business_email': business_email,
                    'business_phone': business_phone,
                    'website': additional_info.get('website'),
                    'categories': additional_info.get('categories'),
                    'primary_category': additional_info.get('primary_category'),
                    'address': address_data
                }
                experience_json = json.dumps(experience_payload)
                documents_payload = {
                    'business_registration_doc': business_registration_doc,
                    'business_permit_doc': business_permit_doc,
                    'tax_registration_doc': tax_registration_doc,
                    'id_document_front': id_front_url or additional_info.get('id_document_front'),
                    'id_document_back': id_back_url or additional_info.get('id_document_back')
                }
                documents_json = json.dumps(documents_payload)
                if existing_app:
                    cursor.execute(
                        """
                        UPDATE applications
                        SET business_name = %s,
                            business_registration = %s,
                            business_email = %s,
                            business_phone = %s,
                            business_registration_doc = %s,
                            business_permit_doc = %s,
                            tax_registration_doc = %s,
                            id_document_front = %s,
                            id_document_back = %s,
                            experience = %s,
                            documents = %s,
                            status = 'pending',
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (
                            business_name,
                            business_registration_number,
                            business_email,
                            business_phone,
                            business_registration_doc,
                            business_permit_doc,
                            tax_registration_doc,
                            id_front_url or additional_info.get('id_document_front'),
                            id_back_url or additional_info.get('id_document_back'),
                            experience_json,
                            documents_json,
                            existing_app[0]
                        )
                    )
                else:
                    cursor.execute(
                        """
                        INSERT INTO applications (
                            user_id,
                            application_type,
                            status,
                            business_name,
                            business_registration,
                            business_email,
                            business_phone,
                            business_registration_doc,
                            business_permit_doc,
                            tax_registration_doc,
                            id_document_front,
                            id_document_back,
                            experience,
                            documents
                        ) VALUES (
                            %s, 'seller', 'pending', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                        )
                        """,
                        (
                            user_id,
                            business_name,
                            business_registration_number,
                            business_email,
                            business_phone,
                            business_registration_doc,
                            business_permit_doc,
                            tax_registration_doc,
                            id_front_url or additional_info.get('id_document_front'),
                            id_back_url or additional_info.get('id_document_back'),
                            experience_json,
                            documents_json
                        )
                    )
            except Exception as app_sync_error:
                print(f"[REGISTER] Failed to sync seller application for user {user_id}: {app_sync_error}")

        def ensure_rider_application_record():
            if not additional_info:
                return
            try:
                cursor.execute(
                    "SELECT id FROM applications WHERE user_id = %s AND application_type = 'rider' LIMIT 1",
                    (user_id,)
                )
                existing_app = cursor.fetchone()
                
                vehicle_type = additional_info.get('vehicle_type') or data.get('vehicleType', '')
                license_number = additional_info.get('license_number') or data.get('licenseNumber', '')
                license_expiry = additional_info.get('license_expiry') or data.get('licenseExpiry')
                vehicle_make_model = additional_info.get('vehicle_make_model') or data.get('vehicleMakeModel', '')
                experience_description = additional_info.get('experience_description') or data.get('experienceDescription', '')
                
                # Prepare experience payload
                experience_payload = {
                    'full_name': data.get('name'),
                    'email': data.get('email'),
                    'phone': phone,
                    'license_expiry': license_expiry,
                    'vehicle_make_model': vehicle_make_model,
                    'vehicle_plate_number': additional_info.get('vehicle_plate_number', ''),
                    'experience_description': experience_description,
                    'availability': additional_info.get('availability', ''),
                    'base_location': additional_info.get('address', ''),
                    'coverage_area': additional_info.get('coverage_area', ''),
                    'address': address_data
                }
                experience_json = json.dumps(experience_payload)
                
                # Prepare documents payload
                documents_payload = {
                    'license_document': additional_info.get('license_document'),
                    'license_front': additional_info.get('license_front') or license_front_url,
                    'license_back': additional_info.get('license_back') or license_back_url,
                    'id_document_front': id_front_url or additional_info.get('id_document_front'),
                    'id_document_back': id_back_url or additional_info.get('id_document_back')
                }
                documents_json = json.dumps(documents_payload)
                
                # Get OR/CR document URLs
                or_doc_url = additional_info.get('or_document') or or_document_url
                cr_doc_url = additional_info.get('cr_document') or cr_document_url
                
                if existing_app:
                    cursor.execute(
                        """
                        UPDATE applications
                        SET vehicle_type = %s,
                            license_number = %s,
                            license_expiry = %s,
                            vehicle_make_model = %s,
                            license_front = %s,
                            license_back = %s,
                            id_document_front = %s,
                            id_document_back = %s,
                            or_document = %s,
                            cr_document = %s,
                            experience = %s,
                            documents = %s,
                            status = 'pending',
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (
                            vehicle_type,
                            license_number,
                            license_expiry,
                            vehicle_make_model,
                            additional_info.get('license_front') or license_front_url,
                            additional_info.get('license_back') or license_back_url,
                            id_front_url or additional_info.get('id_document_front'),
                            id_back_url or additional_info.get('id_document_back'),
                            or_doc_url,
                            cr_doc_url,
                            experience_json,
                            documents_json,
                            existing_app[0]
                        )
                    )
                else:
                    cursor.execute(
                        """
                        INSERT INTO applications (
                            user_id,
                            application_type,
                            status,
                            vehicle_type,
                            license_number,
                            license_expiry,
                            vehicle_make_model,
                            license_front,
                            license_back,
                            id_document_front,
                            id_document_back,
                            or_document,
                            cr_document,
                            experience,
                            documents
                        ) VALUES (
                            %s, 'rider', 'pending', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                        )
                        """,
                        (
                            user_id,
                            vehicle_type,
                            license_number,
                            license_expiry,
                            vehicle_make_model,
                            additional_info.get('license_front') or license_front_url,
                            additional_info.get('license_back') or license_back_url,
                            id_front_url or additional_info.get('id_document_front'),
                            id_back_url or additional_info.get('id_document_back'),
                            or_doc_url,
                            cr_doc_url,
                            experience_json,
                            documents_json
                        )
                    )
            except Exception as app_sync_error:
                print(f"[REGISTER] Failed to sync rider application for user {user_id}: {app_sync_error}")

        if role == 'seller':
            ensure_seller_application_record()
        elif role == 'rider':
            ensure_rider_application_record()

        connection.commit()
        
        print(f"[REGISTER] New user registered with ID {user_id}, role: {role}, status: pending, awaiting admin approval")
        
        # Best-effort email confirmation to user
        try:
            send_registration_received_email(data['email'], data.get('name') or 'User')
        except Exception as _:
            pass
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'message': 'Registration successful! Your account is pending admin approval. You will receive an email notification about the decision.',
            'email': data['email'],
            'pending_approval': True,
            'user_id': user_id,
            'role': role
        }), 201
        
    except Exception as e:
        connection.rollback()
        cursor.close()
        connection.close()
        print(f"[REGISTER] Error: {str(e)}")
        return jsonify({'error': 'Registration failed. Please try again.'}), 500


@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    cursor.execute("SELECT * FROM users WHERE email = %s", (data['email'],))
    user = cursor.fetchone()

    # ⚠️ Plain text password comparison (for dev only!)
    if user and user['password'] == data['password']:
        # Check if account status is pending
        if user.get('status') == 'pending':
            cursor.close()
            connection.close()
            return jsonify({
                'success': False,
                'error': 'Your account is pending admin approval. Please wait for approval before logging in.',
                'pending_approval': True
            }), 403
        
        # Check if account is suspended
        if user.get('status') == 'suspended':
            cursor.close()
            connection.close()
            return jsonify({
                'success': False,
                'error': 'Your account has been suspended. Please contact support.',
                'suspended': True
            }), 403
        
        cursor.execute("UPDATE users SET last_login = NOW() WHERE id = %s", (user['id'],))
        connection.commit()

        token = jwt.encode(
            {
                'user_id': user['id'],
                'email': user['email'],
                'role': user['role'],
                'exp': int((datetime.now(timezone.utc) + timedelta(days=7)).timestamp()),
                'iat': int(datetime.now(timezone.utc).timestamp())
            },
            app.config['SECRET_KEY'],
            algorithm='HS256'
        )
        # Normalize token to string for JSON response (PyJWT may return bytes)
        if isinstance(token, bytes):
            token = token.decode('utf-8')

        session['user_id'] = user['id']
        session['user_role'] = user['role']

        cursor.close()
        connection.close()

        return jsonify({
            'success': True,
            'token': token,
            'user': {
                'id': user['id'],
                'name': user['name'],
                'email': user['email'],
                'role': user['role'],
                'last_login': user['last_login'].isoformat() if user['last_login'] else None
            }
        })

    cursor.close()
    connection.close()
    return jsonify({'success': False, 'error': 'Invalid email or password'}), 401

@app.route('/api/auth/verify-email', methods=['POST'])
def verify_email():
    """Verify user email with verification code"""
    data = request.get_json()
    
    if not data or not data.get('email') or not data.get('code'):
        return jsonify({'error': 'Email and verification code are required'}), 400
    
    email = data['email'].lower().strip()
    code = data['code'].strip()
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get user with verification code
        cursor.execute("""
            SELECT id, name, email, email_verified, verification_code, 
                   verification_code_expires_at, verification_attempts
            FROM users 
            WHERE email = %s
        """, (email,))
        
        user = cursor.fetchone()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        if user['email_verified']:
            return jsonify({
                'success': True,
                'message': 'Email already verified. You can now log in.'
            })
        
        if not user['verification_code']:
            return jsonify({'error': 'No verification code found. Please request a new one.'}), 400
        
        # Check if code expired
        if datetime.now() > user['verification_code_expires_at']:
            return jsonify({
                'error': 'Verification code has expired. Please request a new one.',
                'expired': True
            }), 400
        
        # Check attempts
        if user['verification_attempts'] >= 5:
            return jsonify({
                'error': 'Too many failed attempts. Please request a new verification code.',
                'max_attempts_reached': True
            }), 400
        
        # Verify code
        if user['verification_code'] != code:
            # Increment attempts
            cursor.execute("""
                UPDATE users 
                SET verification_attempts = verification_attempts + 1
                WHERE id = %s
            """, (user['id'],))
            connection.commit()
            
            attempts_left = 5 - (user['verification_attempts'] + 1)
            return jsonify({
                'error': 'Invalid verification code',
                'attempts_remaining': attempts_left
            }), 400
        
        # Code is valid - mark email as verified
        cursor.execute("""
            UPDATE users 
            SET email_verified = TRUE,
                verification_code = NULL,
                verification_code_expires_at = NULL,
                verification_attempts = 0
            WHERE id = %s
        """, (user['id'],))
        connection.commit()
        
        print(f"[EMAIL_VERIFICATION] Email verified for user {user['email']}")
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'message': 'Email verified successfully! You can now log in.',
            'email_verified': True
        })
        
    except Exception as e:
        print(f"[EMAIL_VERIFICATION] Error: {str(e)}")
        cursor.close()
        connection.close()
        return jsonify({'error': 'Verification failed. Please try again.'}), 500

@app.route('/api/auth/resend-verification', methods=['POST'])
def resend_verification():
    """Resend verification code to user email"""
    data = request.get_json()
    
    if not data or not data.get('email'):
        return jsonify({'error': 'Email is required'}), 400
    
    email = data['email'].lower().strip()
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get user
        cursor.execute("""
            SELECT id, name, email, email_verified, verification_code_expires_at
            FROM users 
            WHERE email = %s
        """, (email,))
        
        user = cursor.fetchone()
        
        if not user:
            # Don't reveal if user exists - security best practice
            return jsonify({
                'success': True,
                'message': 'If an account exists with this email, a new verification code has been sent.'
            })
        
        if user['email_verified']:
            return jsonify({
                'success': True,
                'message': 'Email already verified. You can log in now.'
            })
        
        # Check if last code was sent recently (rate limiting)
        if user['verification_code_expires_at']:
            time_since_last_code = datetime.now() - (user['verification_code_expires_at'] - timedelta(minutes=10))
            if time_since_last_code < timedelta(minutes=1):
                seconds_left = int((timedelta(minutes=1) - time_since_last_code).total_seconds())
                return jsonify({
                    'error': f'Please wait {seconds_left} seconds before requesting a new code',
                    'rate_limited': True,
                    'seconds_remaining': seconds_left
                }), 429
        
        # Generate new verification code
        verification_code = generate_verification_code()
        expires_at = datetime.now() + timedelta(minutes=10)
        
        cursor.execute("""
            UPDATE users 
            SET verification_code = %s,
                verification_code_expires_at = %s,
                verification_attempts = 0
            WHERE id = %s
        """, (verification_code, expires_at, user['id']))
        connection.commit()
        
        # Send verification email
        email_sent = send_verification_email(email, verification_code, user['name'])
        
        if not email_sent:
            print(f"[RESEND_VERIFICATION] Warning: Failed to send email to {email}")
            print(f"[RESEND_VERIFICATION] Verification code for {email}: {verification_code}")
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'message': 'A new verification code has been sent to your email.',
            'email_sent': email_sent
        })
        
    except Exception as e:
        print(f"[RESEND_VERIFICATION] Error: {str(e)}")
        cursor.close()
        connection.close()
        return jsonify({'error': 'Failed to resend verification code. Please try again.'}), 500

@app.route('/verify-email')
def serve_verify_email():
    """Serve the email verification page"""
    return send_from_directory('../templates/Authenticator', 'verify-email.html')

@app.route('/api/config/maps-api-key', methods=['GET'])
def get_maps_api_key():
    """Get Google Maps API key for frontend (public endpoint)"""
    if not GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_API_KEY == "YOUR_GOOGLE_MAPS_API_KEY_HERE":
        return jsonify({
            'success': False,
            'error': 'Google Maps API key not configured'
        }), 400
    
    return jsonify({
        'success': True,
        'api_key': GOOGLE_MAPS_API_KEY
    })

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    # Clear server-side session data
    session.clear()
    return jsonify({
        'success': True,
        'message': 'Logged out successfully'
    })

@app.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    """Request password reset email"""
    data = request.get_json()
    
    if not data or not data.get('email'):
        return jsonify({'error': 'Email is required'}), 400
    
    email = data['email'].lower().strip()
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Check if user exists
        cursor.execute("SELECT id, name, email FROM users WHERE email = %s", (email,))
        user = cursor.fetchone()
        
        if not user:
            print(f"[FORGOT_PASSWORD] Password reset requested for non-existent email: {email}")
            return jsonify({
                'success': False,
                'error': 'No account found with that email address.'
            }), 404
        
        # Create reset token
        reset_token = create_password_reset_token(user['id'])
        
        if not reset_token:
            print(f"[FORGOT_PASSWORD] Failed to create reset token for user {user['id']}")
            return jsonify({
                'success': False,
                'error': 'Unable to process password reset. Please try again later.'
            }), 500
        
        # Send reset email
        email_sent = send_password_reset_email(user['email'], reset_token, user['name'])
        
        if not email_sent:
            print(f"[FORGOT_PASSWORD] Failed to send password reset email to {user['email']}")
            return jsonify({
                'success': False,
                'error': 'Failed to send reset email. Please try again later.'
            }), 500
        
        print(f"[FORGOT_PASSWORD] Password reset email sent successfully to {user['email']}")
        
        return jsonify({
            'success': True,
            'message': 'Password reset instructions have been sent to your email.'
        })
        
    except Exception as e:
        print(f"[FORGOT_PASSWORD] Error processing request: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to process password reset. Please try again later.'
        }), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    """Reset password using token"""
    data = request.get_json()
    
    if not data or not all(k in data for k in ('token', 'password')):
        return jsonify({'error': 'Token and new password are required'}), 400
    
    token = data['token']
    new_password = data['password']
    
    # Verify token
    user_id = verify_reset_token(token)
    
    if not user_id:
        return jsonify({'error': 'Invalid or expired reset token'}), 400
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get user details
        cursor.execute("SELECT email, name FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        
        if not user:
            return jsonify({'error': 'User not found'}), 400
        
        # Update password
        cursor.execute("""
            UPDATE users 
            SET password = %s, updated_at = NOW() 
            WHERE id = %s
        """, (new_password, user_id))
        
        # Mark token as used
        mark_token_as_used(token)
        
        # Invalidate any other outstanding reset tokens for this user
        cursor.execute("UPDATE password_reset_tokens SET used = 1 WHERE user_id = %s", (user_id,))
        
        connection.commit()
        
        print(f"[RESET_PASSWORD] Password successfully reset for user {user['email']}")
        
        return jsonify({
            'success': True,
            'message': 'Password has been reset successfully. You can now login with your new password.'
        })
        
    except Exception as e:
        connection.rollback()
        print(f"[RESET_PASSWORD] Error resetting password: {str(e)}")
        return jsonify({'error': 'Failed to reset password. Please try again.'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/auth/verify-reset-token', methods=['POST'])
def verify_reset_token_endpoint():
    """Verify if a reset token is valid"""
    data = request.get_json()
    
    if not data or not data.get('token'):
        return jsonify({'error': 'Token is required'}), 400
    
    token = data['token']
    user_id = verify_reset_token(token)
    
    if user_id:
        return jsonify({
            'success': True,
            'valid': True,
            'message': 'Token is valid'
        })
    else:
        return jsonify({
            'success': False,
            'valid': False,
            'error': 'Token is invalid or has expired'
        }), 400

@app.route('/api/account/profile', methods=['GET', 'PUT'])
@token_required
def account_profile(current_user):
    if request.method == 'GET':
        return jsonify({
            'success': True,
            'user': {
                'id': current_user.get('id'),
                'name': current_user.get('name'),
                'email': current_user.get('email'),
                'role': current_user.get('role'),
                'phone': current_user.get('phone') if isinstance(current_user, dict) and 'phone' in current_user else None,
                'address': current_user.get('address') if isinstance(current_user, dict) and 'address' in current_user else None,
                'profile_picture': current_user.get('profile_picture')
            }
        })
    
    data = request.get_json() or {}
    name = data.get('name')
    phone = data.get('phone')
    email = (data.get('email') or None)
    profile_picture = data.get('profile_picture')

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = connection.cursor(dictionary=True)
    try:
        # If email provided and different, ensure it's unique
        if email:
            cursor.execute("SELECT id FROM users WHERE email = %s AND id != %s", (email.lower().strip(), current_user['id']))
            exists = cursor.fetchone()
            if exists:
                return jsonify({'error': 'Email already in use'}), 400
        
        # Build dynamic update
        fields = []
        params = []
        if name is not None:
            fields.append("name = %s"); params.append(name)
        if phone is not None:
            fields.append("phone = %s"); params.append(phone)
        if email is not None:
            fields.append("email = %s"); params.append(email.lower().strip())
        if profile_picture is not None:
            fields.append("profile_picture = %s"); params.append(profile_picture)
        fields.append("updated_at = NOW()")
        
        if len(params) > 0:
            q = f"UPDATE users SET {', '.join(fields)} WHERE id = %s"
            params.append(current_user['id'])
            cursor.execute(q, tuple(params))
            connection.commit()
        
        return jsonify({'success': True, 'message': 'Profile updated'})
    except Exception as e:
        connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/account/password', methods=['PUT'])
@token_required
def change_account_password(current_user):
    data = request.get_json() or {}
    current_password = data.get('current_password')
    new_password = data.get('new_password')

    if not current_password or not new_password:
        return jsonify({'error': 'Missing required fields'}), 400

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT password FROM users WHERE id = %s", (current_user['id'],))
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'User not found'}), 404
        if row['password'] != current_password:
            return jsonify({'error': 'Current password is incorrect'}), 400

        cursor.execute("UPDATE users SET password = %s, updated_at = NOW() WHERE id = %s", (new_password, current_user['id']))
        connection.commit()
        return jsonify({'success': True, 'message': 'Password updated successfully'})
    except Exception as e:
        connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/account/addresses', methods=['GET', 'POST'])
@token_required
def user_addresses(current_user):
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = connection.cursor(dictionary=True)
    
    if request.method == 'GET':
        try:
            cursor.execute("""
                SELECT 
                    id, label, contact_name, contact_phone,
                    region, province, city, barangay, street, postal_code,
                    latitude, longitude, is_default, created_at, updated_at
                FROM user_addresses
                WHERE user_id = %s
                ORDER BY is_default DESC, updated_at DESC
            """, (current_user['id'],))
            rows = cursor.fetchall()
            
            # If no saved addresses exist, check if user has address in users table
            if not rows:
                cursor.execute("""
                    SELECT address FROM users WHERE id = %s
                """, (current_user['id'],))
                user_row = cursor.fetchone()
                if user_row and user_row.get('address'):
                    import json
                    try:
                        address_data = json.loads(user_row['address'])
                        # Convert users.address JSON to address format
                        user_address = {
                            'id': None,  # No ID since it's from users table
                            'label': 'Registration Address',
                            'contact_name': current_user.get('name', ''),
                            'contact_phone': current_user.get('phone', ''),
                            'region': address_data.get('region', ''),
                            'province': address_data.get('province', ''),
                            'city': address_data.get('city', ''),
                            'barangay': address_data.get('barangay', ''),
                            'street': address_data.get('street', '') or address_data.get('address', ''),
                            'postal_code': address_data.get('postal_code', ''),
                            'latitude': None,
                            'longitude': None,
                            'is_default': True,  # Mark as default since it's the only one
                            'created_at': None,
                            'updated_at': None,
                            'from_users_table': True  # Flag to indicate this is from users table
                        }
                        rows = [user_address]
                    except (json.JSONDecodeError, TypeError):
                        # If address is not JSON, treat it as a plain string
                        if user_row['address']:
                            user_address = {
                                'id': None,
                                'label': 'Registration Address',
                                'contact_name': current_user.get('name', ''),
                                'contact_phone': current_user.get('phone', ''),
                                'region': '',
                                'province': '',
                                'city': '',
                                'barangay': '',
                                'street': user_row['address'],
                                'postal_code': '',
                                'latitude': None,
                                'longitude': None,
                                'is_default': True,
                                'created_at': None,
                                'updated_at': None,
                                'from_users_table': True
                            }
                            rows = [user_address]
            
            return jsonify({'success': True, 'addresses': rows})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        finally:
            cursor.close()
            connection.close()
    
    data = request.get_json() or {}
    required = ['region', 'province', 'city', 'barangay', 'street']
    if not all(data.get(f) for f in required):
        return jsonify({'error': 'Missing required address fields'}), 400

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = connection.cursor()
    try:
        # If setting as default, clear others
        if data.get('is_default'):
            cursor.execute("UPDATE user_addresses SET is_default = 0 WHERE user_id = %s", (current_user['id'],))

        cursor.execute("""
            INSERT INTO user_addresses (
                user_id, label, contact_name, contact_phone,
                region, region_code, province, province_code,
                city, city_code, barangay, barangay_code,
                street, postal_code, latitude, longitude, is_default
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            current_user['id'],
            data.get('label'), data.get('contact_name'), data.get('contact_phone'),
            data.get('region'), data.get('region_code'), data.get('province'), data.get('province_code'),
            data.get('city'), data.get('city_code'), data.get('barangay'), data.get('barangay_code'),
            data.get('street'), data.get('postal_code'), data.get('latitude'), data.get('longitude'),
            1 if data.get('is_default') else 0
        ))
        connection.commit()
        return jsonify({'success': True, 'message': 'Address added'})
    except Exception as e:
        connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/account/addresses/<int:addr_id>', methods=['PUT', 'DELETE'])
@token_required
def manage_user_address(current_user, addr_id):
    if request.method == 'DELETE':
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        cursor = connection.cursor()
        try:
            cursor.execute("DELETE FROM user_addresses WHERE id = %s AND user_id = %s", (addr_id, current_user['id']))
            if cursor.rowcount == 0:
                return jsonify({'error': 'Address not found'}), 404
            connection.commit()
            return jsonify({'success': True, 'message': 'Address removed'})
        except Exception as e:
            connection.rollback()
            return jsonify({'error': str(e)}), 500
        finally:
            cursor.close()
            connection.close()
    
    data = request.get_json() or {}
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = connection.cursor()
    try:
        # Ensure address belongs to user
        cursor.execute("SELECT id FROM user_addresses WHERE id = %s AND user_id = %s", (addr_id, current_user['id']))
        if not cursor.fetchone():
            return jsonify({'error': 'Address not found'}), 404

        if data.get('is_default'):
            cursor.execute("UPDATE user_addresses SET is_default = 0 WHERE user_id = %s", (current_user['id'],))

        cursor.execute("""
            UPDATE user_addresses SET
                label = COALESCE(%s, label),
                contact_name = COALESCE(%s, contact_name),
                contact_phone = COALESCE(%s, contact_phone),
                region = COALESCE(%s, region),
                region_code = COALESCE(%s, region_code),
                province = COALESCE(%s, province),
                province_code = COALESCE(%s, province_code),
                city = COALESCE(%s, city),
                city_code = COALESCE(%s, city_code),
                barangay = COALESCE(%s, barangay),
                barangay_code = COALESCE(%s, barangay_code),
                street = COALESCE(%s, street),
                postal_code = COALESCE(%s, postal_code),
                latitude = COALESCE(%s, latitude),
                longitude = COALESCE(%s, longitude),
                is_default = COALESCE(%s, is_default),
                updated_at = NOW()
            WHERE id = %s AND user_id = %s
        """, (
            data.get('label'), data.get('contact_name'), data.get('contact_phone'),
            data.get('region'), data.get('region_code'), data.get('province'), data.get('province_code'),
            data.get('city'), data.get('city_code'), data.get('barangay'), data.get('barangay_code'),
            data.get('street'), data.get('postal_code'), data.get('latitude'), data.get('longitude'),
            1 if data.get('is_default') else 0 if data.get('is_default') is not None else None,
            addr_id, current_user['id']
        ))
        connection.commit()
        return jsonify({'success': True, 'message': 'Address updated'})
    except Exception as e:
        connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

# ===== ADMIN USER REGISTRATION MANAGEMENT =====

@app.route('/api/admin/pending-users', methods=['GET'])
@token_required
@admin_required
def get_pending_users(current_user):
    """Get all users pending admin approval or rejected users based on status filter"""
    # Get status filter from query parameter (default to 'pending' to hide rejected by default)
    status_filter = request.args.get('status', 'pending').lower()
    
    # Validate status filter
    valid_statuses = ['pending', 'rejected', 'all']
    if status_filter not in valid_statuses:
        status_filter = 'pending'
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Build query based on status filter - join with applications table to get OR/CR documents
        if status_filter == 'all':
            # Show both pending and rejected (but not active/approved)
            query = """
                SELECT u.id, u.name, u.suffix, u.email, u.phone, u.address, u.gender, u.birthday, u.role, u.id_document,
                       u.id_document_front, u.id_document_back, u.status, u.created_at, u.updated_at,
                       a.or_document, a.cr_document, a.license_front, a.license_back, a.vehicle_type, 
                       a.license_number, a.license_expiry, a.vehicle_make_model
                FROM users u
                LEFT JOIN applications a ON a.user_id = u.id AND a.application_type = u.role
                WHERE u.status IN ('pending', 'rejected')
                ORDER BY u.created_at DESC
            """
            cursor.execute(query)
        else:
            # Show only the selected status
            query = """
                SELECT u.id, u.name, u.suffix, u.email, u.phone, u.address, u.gender, u.birthday, u.role, u.id_document,
                       u.id_document_front, u.id_document_back, u.status, u.created_at, u.updated_at,
                       a.or_document, a.cr_document, a.license_front, a.license_back, a.vehicle_type, 
                       a.license_number, a.license_expiry, a.vehicle_make_model
                FROM users u
                LEFT JOIN applications a ON a.user_id = u.id AND a.application_type = u.role
                WHERE u.status = %s
                ORDER BY u.created_at DESC
            """
            cursor.execute(query, (status_filter,))
        
        users = cursor.fetchall()
        
        # Parse address JSON to extract additional_info and address components
        parsed_users = []
        for user in users:
            user_data = {
                'id': user['id'],
                'name': user['name'],
                'suffix': user.get('suffix'),
                'email': user['email'],
                'phone': user['phone'],
                'address': user['address'],
                'gender': user['gender'],
                'role': user.get('role'),
                'status': user.get('status', 'pending'),
                'birthday': user.get('birthday').isoformat() if user.get('birthday') else None,
                'id_document': user['id_document'],
                'id_document_url': (user['id_document'] if user['id_document'] else None),
                'id_document_front': user.get('id_document_front'),
                'id_document_back': user.get('id_document_back'),
                'created_at': user['created_at'].isoformat() if user['created_at'] else None,
                'updated_at': user['updated_at'].isoformat() if user['updated_at'] else None
            }
            
            # Add application data for riders (OR/CR documents, license info)
            if user.get('role') == 'rider':
                user_data['or_document'] = user.get('or_document')
                user_data['cr_document'] = user.get('cr_document')
                user_data['license_front'] = user.get('license_front')
                user_data['license_back'] = user.get('license_back')
                user_data['vehicle_type'] = user.get('vehicle_type')
                user_data['license_number'] = user.get('license_number')
                user_data['license_expiry'] = user.get('license_expiry')
                user_data['vehicle_make_model'] = user.get('vehicle_make_model')
            
            # Parse address JSON if it exists
            if user.get('address'):
                try:
                    import json
                    address_json = json.loads(user['address']) if isinstance(user['address'], str) else user['address']
                    if isinstance(address_json, dict):
                        # Extract address components
                        user_data['address_string'] = address_json.get('address', user['address'])
                        user_data['region'] = address_json.get('region')
                        user_data['region_code'] = address_json.get('region_code')
                        user_data['province'] = address_json.get('province')
                        user_data['province_code'] = address_json.get('province_code')
                        user_data['city'] = address_json.get('city')
                        user_data['city_code'] = address_json.get('city_code')
                        user_data['barangay'] = address_json.get('barangay')
                        user_data['barangay_code'] = address_json.get('barangay_code')
                        user_data['street'] = address_json.get('street')
                        user_data['postal_code'] = address_json.get('postal_code')
                        
                        # Extract additional_info (role-specific data)
                        additional_info = address_json.get('additional_info', {})
                        if additional_info:
                            user_data['additional_info'] = additional_info
                except Exception as e:
                    print(f"[ADMIN] Error parsing address JSON for user {user['id']}: {str(e)}")
                    user_data['address_string'] = user['address']
            
            # Add application data for riders (OR/CR documents, license info from applications table)
            if user.get('role') == 'rider':
                # Add OR/CR documents from applications table
                if user.get('or_document'):
                    if 'additional_info' not in user_data:
                        user_data['additional_info'] = {}
                    user_data['additional_info']['or_document'] = user.get('or_document')
                if user.get('cr_document'):
                    if 'additional_info' not in user_data:
                        user_data['additional_info'] = {}
                    user_data['additional_info']['cr_document'] = user.get('cr_document')
                # Also add license info from applications table if not in additional_info
                if user.get('license_front') and ('additional_info' not in user_data or 'license_front' not in user_data.get('additional_info', {})):
                    if 'additional_info' not in user_data:
                        user_data['additional_info'] = {}
                    user_data['additional_info']['license_front'] = user.get('license_front')
                if user.get('license_back') and ('additional_info' not in user_data or 'license_back' not in user_data.get('additional_info', {})):
                    if 'additional_info' not in user_data:
                        user_data['additional_info'] = {}
                    user_data['additional_info']['license_back'] = user.get('license_back')
                # Add vehicle info from applications table if not in additional_info
                if user.get('vehicle_type') and ('additional_info' not in user_data or 'vehicle_type' not in user_data.get('additional_info', {})):
                    if 'additional_info' not in user_data:
                        user_data['additional_info'] = {}
                    user_data['additional_info']['vehicle_type'] = user.get('vehicle_type')
                if user.get('vehicle_make_model') and ('additional_info' not in user_data or 'vehicle_make_model' not in user_data.get('additional_info', {})):
                    if 'additional_info' not in user_data:
                        user_data['additional_info'] = {}
                    user_data['additional_info']['vehicle_make_model'] = user.get('vehicle_make_model')
                if user.get('license_number') and ('additional_info' not in user_data or 'license_number' not in user_data.get('additional_info', {})):
                    if 'additional_info' not in user_data:
                        user_data['additional_info'] = {}
                    user_data['additional_info']['license_number'] = user.get('license_number')
                if user.get('license_expiry') and ('additional_info' not in user_data or 'license_expiry' not in user_data.get('additional_info', {})):
                    if 'additional_info' not in user_data:
                        user_data['additional_info'] = {}
                    license_expiry = user.get('license_expiry')
                    if license_expiry:
                        if hasattr(license_expiry, 'isoformat'):
                            user_data['additional_info']['license_expiry'] = license_expiry.isoformat()
                        elif isinstance(license_expiry, str):
                            user_data['additional_info']['license_expiry'] = license_expiry
                        else:
                            user_data['additional_info']['license_expiry'] = str(license_expiry)
            
            parsed_users.append(user_data)
        
        return jsonify({
            'success': True,
            'pending_users': parsed_users
        })
    
    except Exception as e:
        print(f"[ADMIN] Error fetching pending users: {str(e)}")
        return jsonify({'error': 'Failed to fetch pending users'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/admin/users/<int:user_id>/approve', methods=['POST'])
@token_required
@admin_required
def approve_user(current_user, user_id):
    """Approve a pending user registration"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Check if user exists and is pending
        cursor.execute("SELECT id, name, email, status FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        if user['status'] != 'pending':
            return jsonify({'error': f'User status is {user["status"]}, not pending'}), 400
        
        # Ensure 'approved' is in the users.status enum
        try:
            cursor.execute("SHOW COLUMNS FROM users WHERE Field = 'status'")
            status_col = cursor.fetchone()
            if status_col:
                enum_str = status_col[1] if isinstance(status_col, tuple) else status_col.get('Type', '')
                if 'approved' not in enum_str.upper():
                    # Add 'approved' to the status ENUM if it doesn't exist
                    cursor.execute("""
                        ALTER TABLE users 
                        MODIFY COLUMN status ENUM('active', 'suspended', 'pending', 'rejected', 'approved', 'available', 'busy', 'offline') 
                        DEFAULT 'pending'
                    """)
                    print(f"[APPROVAL] Added 'approved' to users.status enum")
        except Exception as enum_error:
            print(f"[APPROVAL] Warning: Could not check/modify users.status enum: {enum_error}")
        
        # Check if user has a pending application and approve it too
        cursor.execute("""
            SELECT id, application_type, status 
            FROM applications 
            WHERE user_id = %s AND status = 'pending'
            ORDER BY created_at DESC
            LIMIT 1
        """, (user_id,))
        pending_application = cursor.fetchone()
        
        # Approve the user by setting status to 'approved' (matching applications table)
        cursor.execute("""
            UPDATE users 
            SET status = 'approved', updated_at = NOW()
            WHERE id = %s
        """, (user_id,))
        
        rows_affected = cursor.rowcount
        if rows_affected == 0:
            raise Exception(f"Failed to update user {user_id} status - no rows affected")
        
        # If user has a pending application, approve it too to keep both tables in sync
        if pending_application:
            cursor.execute("""
                UPDATE applications 
                SET status = 'approved', updated_at = NOW() 
                WHERE id = %s
            """, (pending_application['id'],))
            print(f"[ADMIN] Also approved pending {pending_application['application_type']} application {pending_application['id']} for user {user_id}")
        
        connection.commit()
        
        # Verify the status was updated correctly
        cursor.execute("SELECT status FROM users WHERE id = %s", (user_id,))
        verify_user = cursor.fetchone()
        actual_status = verify_user.get('status') if verify_user and isinstance(verify_user, dict) else (verify_user[0] if verify_user and isinstance(verify_user, tuple) else None)
        
        # Verify application status if it was updated
        if pending_application:
            cursor.execute("SELECT status FROM applications WHERE id = %s", (pending_application['id'],))
            verify_app = cursor.fetchone()
            app_status = verify_app.get('status') if verify_app and isinstance(verify_app, dict) else (verify_app[0] if verify_app and isinstance(verify_app, tuple) else None)
            print(f"[ADMIN] User {user['name']} (ID: {user_id}) and application {pending_application['id']} approved by admin {current_user['name']} (ID: {current_user['id']}) - User Status: {actual_status}, App Status: {app_status}")
            
            if app_status != 'approved':
                print(f"[ADMIN] WARNING: Application {pending_application['id']} status is '{app_status}', expected 'approved'")
        else:
            print(f"[ADMIN] User {user['name']} (ID: {user_id}) approved by admin {current_user['name']} (ID: {current_user['id']}) - Status: {actual_status}")
        
        if actual_status != 'approved':
            print(f"[ADMIN] WARNING: User {user_id} status is '{actual_status}', expected 'approved'")
        
        # Notify user via email (best-effort)
        try:
            send_admin_decision_email(user.get('email'), 'approved', user.get('name') or 'User')
        except Exception as _:
            pass
        
        return jsonify({
            'success': True,
            'message': f'User {user["name"]} has been approved',
            'user': {
                'id': user['id'],
                'name': user['name'],
                'email': user['email'],
                'status': 'approved'
            }
        })
    
    except Exception as e:
        connection.rollback()
        print(f"[ADMIN] Error approving user {user_id}: {str(e)}")
        return jsonify({'error': 'Failed to approve user'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/admin/users/<int:user_id>/reject', methods=['POST'])
@token_required
@admin_required
def reject_user(current_user, user_id):
    """Reject a pending user registration"""
    data = request.get_json() or {}
    rejection_reason = data.get('reason', 'No reason provided')
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Check if user exists and is pending
        cursor.execute("SELECT id, name, email, status FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        if user['status'] != 'pending':
            return jsonify({'error': f'User status is {user["status"]}, not pending'}), 400
        
        # Set status to 'rejected' instead of deleting (keep record in system)
        cursor.execute("""
            UPDATE users 
            SET status = 'rejected', updated_at = NOW()
            WHERE id = %s
        """, (user_id,))
        
        connection.commit()
        
        # Attempt to notify user via email (best-effort)
        try:
            send_admin_decision_email(user.get('email'), 'rejected', user.get('name') or 'User', rejection_reason)
        except Exception as _:
            pass
        
        print(f"[ADMIN] User {user['name']} (ID: {user_id}) rejected by admin {current_user['name']} (ID: {current_user['id']}). Reason: {rejection_reason}")
        
        return jsonify({
            'success': True,
            'message': f'User {user["name"]} has been rejected',
            'reason': rejection_reason,
            'user': {
                'id': user['id'],
                'name': user['name'],
                'email': user['email'],
                'status': 'rejected'
            }
        })
    
    except Exception as e:
        connection.rollback()
        print(f"[ADMIN] Error rejecting user {user_id}: {str(e)}")
        return jsonify({'error': 'Failed to reject user'}), 500
    finally:
        cursor.close()
        connection.close()

# ===== ADMIN STATS AND OTHER ENDPOINTS =====

@app.route('/api/admin/stats', methods=['GET'])
@token_required
@admin_required
def get_admin_stats(current_user):
    # Optional range for commission chart: 'week', '1', '3', '6', '12' (default 6)
    range_param = request.args.get('range', '6')
    
    # Calculate date range based on parameter
    if range_param == 'week':
        # Last 7 days - group by day
        is_weekly = True
        months_interval = 0  # Not used for weekly
    else:
        # Monthly grouping
        try:
            months = int(range_param)
        except (ValueError, TypeError):
            months = 6
        months = max(1, min(months, 24))
        months_interval = max(0, months - 1)
        is_weekly = False

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    # Get total users (non-admin)
    cursor.execute("SELECT COUNT(*) as count FROM users WHERE role != 'admin'")
    total_users = cursor.fetchone()['count']
    
    # Get pending applications
    cursor.execute("SELECT COUNT(*) as count FROM applications WHERE status = 'pending'")
    pending_applications = cursor.fetchone()['count']
    
    # Get active products
    cursor.execute("SELECT COUNT(*) as count FROM products WHERE is_active = 1")
    active_products = cursor.fetchone()['count']
    
    # Get total products (all products)
    cursor.execute("SELECT COUNT(*) as count FROM products")
    total_products = cursor.fetchone()['count']
    
    # Get total orders
    cursor.execute("SELECT COUNT(*) as count FROM orders")
    total_orders = cursor.fetchone()['count']
    
    # Get pending orders (orders that need action)
    cursor.execute("""
        SELECT COUNT(*) as count 
        FROM orders 
        WHERE status IN ('pending', 'confirmed', 'prepared')
    """)
    pending_orders = cursor.fetchone()['count']
    
    # Get pending deliveries
    cursor.execute("""
        SELECT COUNT(*) as count 
        FROM deliveries 
        WHERE status IN ('pending', 'assigned', 'in_transit')
    """)
    pending_deliveries = cursor.fetchone()['count']
    
    # --- Admin commission stats ---
    # Total admin earnings (all time)
    cursor.execute("SELECT COALESCE(SUM(admin_commission), 0) AS total_commission FROM orders WHERE payment_status = 'paid'")
    row = cursor.fetchone() or {}
    admin_total_earnings = float(row.get('total_commission') or 0)
    
    # This month
    cursor.execute(
        """
        SELECT COALESCE(SUM(admin_commission), 0) AS total_commission
        FROM orders
        WHERE payment_status = 'paid'
          AND YEAR(created_at) = YEAR(CURDATE())
          AND MONTH(created_at) = MONTH(CURDATE())
        """
    )
    row = cursor.fetchone() or {}
    admin_month_earnings = float(row.get('total_commission') or 0)
    
    # Today
    cursor.execute(
        """
        SELECT COALESCE(SUM(admin_commission), 0) AS total_commission
        FROM orders
        WHERE payment_status = 'paid'
          AND DATE(created_at) = CURDATE()
        """
    )
    row = cursor.fetchone() or {}
    admin_today_earnings = float(row.get('total_commission') or 0)
    
    # Recent commissions list (last 5 paid orders)
    cursor.execute(
        """
        SELECT order_number, product_subtotal, admin_commission, created_at
        FROM orders
        WHERE payment_status = 'paid'
        ORDER BY created_at DESC
        LIMIT 5
        """
    )
    recent_rows = cursor.fetchall() or []
    recent_commissions = [
        {
            'order_number': r['order_number'],
            'product_subtotal': float(r.get('product_subtotal') or 0),
            'admin_commission': float(r.get('admin_commission') or 0),
            'created_at': r['created_at'].isoformat() if r.get('created_at') else None,
        }
        for r in recent_rows
    ]
    
    # Commission data based on range (weekly or monthly)
    if is_weekly:
        # Weekly: group by day for last 7 days
        cursor.execute("""
            SELECT DATE(created_at) AS period_start,
                   DATE_FORMAT(created_at, '%b %d') AS label,
                   COALESCE(SUM(admin_commission), 0) AS total_commission
            FROM orders
            WHERE payment_status = 'paid'
              AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY DATE(created_at)
            ORDER BY period_start
        """)
    else:
        # Monthly: group by month
        cursor.execute(f"""
            SELECT DATE_FORMAT(created_at, '%Y-%m-01') AS period_start,
               DATE_FORMAT(created_at, '%b %Y') AS label,
               COALESCE(SUM(admin_commission), 0) AS total_commission
        FROM orders
        WHERE payment_status = 'paid'
          AND created_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL {months_interval} MONTH)
            GROUP BY DATE_FORMAT(created_at, '%Y-%m-01'), DATE_FORMAT(created_at, '%b %Y')
            ORDER BY period_start
        """)
    commission_rows = cursor.fetchall() or []
    commission_data = [
        {
            'label': r['label'],
            'total_commission': float(r.get('total_commission') or 0),
        }
        for r in commission_rows
    ]
    
    # Keep monthly_commissions for backward compatibility
    monthly_commissions = commission_data
    
    cursor.close()
    connection.close()
    
    return jsonify({
        'success': True,
        'stats': {
            'total_users': total_users,
            'pending_applications': pending_applications,
            'active_products': active_products,
            'total_products': total_products,
            'total_orders': total_orders,
            'pending_orders': pending_orders,
            'pending_deliveries': pending_deliveries,
            'admin_total_earnings': admin_total_earnings,
            'admin_month_earnings': admin_month_earnings,
            'admin_today_earnings': admin_today_earnings,
            'recent_commissions': recent_commissions,
            'monthly_commissions': monthly_commissions,  # For backward compatibility
            'commission_data': commission_data,  # New format
        }
    })

@app.route('/api/admin/applications', methods=['GET'])
@token_required
@admin_required
def get_applications(current_user):
    # Get query parameters for filtering
    application_type = request.args.get('type')  # 'seller' or 'rider'
    # Default to 'all' so admins see every application unless they filter explicitly
    status_filter = (request.args.get('status') or 'all').lower()  # 'pending', 'approved', 'rejected', or 'all'
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    # Build query based on filters
    where_clauses = []
    params = []
    
    # Filter by application type if specified
    if application_type:
        where_clauses.append("a.application_type = %s")
        params.append(application_type)
    
    # Filter by status
    if status_filter and status_filter != 'all':
        where_clauses.append("a.status = %s")
        params.append(status_filter)
    
    # Build WHERE clause
    where_sql = ""
    if where_clauses:
        where_sql = "WHERE " + " AND ".join(where_clauses)
    
    query = f"""
        SELECT a.*, u.name as user_name, u.email, u.phone
        FROM applications a
        JOIN users u ON a.user_id = u.id
        {where_sql}
        ORDER BY a.created_at DESC
    """
    
    cursor.execute(query, params)
    applications = cursor.fetchall()
    cursor.close()
    connection.close()
    
    return jsonify({
        'success': True,
        'applications': [{
            'id': app['id'],
            'user_name': app['user_name'],
            'email': app['email'],
            'phone': app.get('phone'),
            'application_type': app['application_type'],
            'status': app['status'],
            'business_name': app['business_name'],
            'business_registration': app.get('business_registration'),
            'business_email': app.get('business_email'),
            'business_phone': app.get('business_phone'),
            'business_registration_doc': app.get('business_registration_doc'),
            'business_permit_doc': app.get('business_permit_doc'),
            'tax_registration_doc': app.get('tax_registration_doc'),
            'vehicle_type': app.get('vehicle_type'),
            'vehicle_make_model': app.get('vehicle_make_model'),
            'license_number': app.get('license_number'),
            'license_expiry': app.get('license_expiry').isoformat() if app.get('license_expiry') else None,
            'license_front': app.get('license_front'),
            'license_back': app.get('license_back'),
            'or_document': app.get('or_document'),
            'cr_document': app.get('cr_document'),
            'experience': app['experience'],
            'created_at': app['created_at'].isoformat() if app['created_at'] else None,
            'updated_at': app['updated_at'].isoformat() if app['updated_at'] else None
        } for app in applications]
    })

@app.route('/api/admin/applications/<int:app_id>', methods=['GET'])
@token_required
@admin_required
def get_application_details(current_user, app_id):
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get application details with user information
        cursor.execute("""
            SELECT a.*, u.name as user_name, u.email, u.phone
            FROM applications a
            JOIN users u ON a.user_id = u.id
            WHERE a.id = %s
        """, (app_id,))
        
        application = cursor.fetchone()
        
        if not application:
            return jsonify({'error': 'Application not found'}), 404
        
        return jsonify({
            'success': True,
            'application': {
                'id': application['id'],
                'user_name': application['user_name'],
                'email': application['email'],
                'phone': application.get('phone'),
                'application_type': application['application_type'],
                'status': application['status'],
                'business_name': application['business_name'],
                'business_registration': application.get('business_registration'),
                'business_email': application.get('business_email'),
                'business_phone': application.get('business_phone'),
                'business_registration_doc': application.get('business_registration_doc'),
                'business_permit_doc': application.get('business_permit_doc'),
                'tax_registration_doc': application.get('tax_registration_doc'),
                'vehicle_type': application.get('vehicle_type'),
                'vehicle_make_model': application.get('vehicle_make_model'),
                'license_number': application.get('license_number'),
                'license_expiry': application.get('license_expiry').isoformat() if application.get('license_expiry') else None,
                'license_front': application.get('license_front'),
                'license_back': application.get('license_back'),
                'or_document': application.get('or_document'),
                'cr_document': application.get('cr_document'),
                'experience': application['experience'],
                'documents': application.get('documents'),
                'admin_notes': application.get('admin_notes'),
                'created_at': application['created_at'].isoformat() if application['created_at'] else None,
                'updated_at': application['updated_at'].isoformat() if application['updated_at'] else None
            }
        })
        
    except Exception as e:
        print(f"Error fetching application details: {str(e)}")
        return jsonify({'error': 'Failed to fetch application details'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/admin/applications/<int:app_id>/approve', methods=['POST'])
@token_required
@admin_required
def approve_application(current_user, app_id):
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get application details
        cursor.execute("SELECT * FROM applications WHERE id = %s", (app_id,))
        application = cursor.fetchone()
        
        if not application:
            return jsonify({'error': 'Application not found'}), 404
        
        # CRITICAL: Update application status to 'approved' FIRST - this is required for sellers to add products
        # The applications table status MUST be 'approved' (not 'pending') for the seller to be able to add products
        cursor.execute("UPDATE applications SET status = 'approved', updated_at = NOW() WHERE id = %s", (app_id,))
        rows_affected = cursor.rowcount
        print(f"[APPROVAL] Updated application {app_id} status to 'approved' for user {application['user_id']} (rows affected: {rows_affected})")
        
        # Verify the update was successful
        if rows_affected == 0:
            raise Exception(f"Failed to update application {app_id} status - no rows affected. Application may not exist.")
        
        # Update user role and set status to match the application table
        if application['application_type'] == 'rider':
            cursor.execute("UPDATE users SET role = %s, status = 'available' WHERE id = %s", 
                      (application['application_type'], application['user_id']))
            print(f"[RIDER-STATUS] New rider {application['user_id']} approved with default status 'available'")
        else:
            # For sellers: update role to 'seller' and set status to 'approved' to match applications table
            # This ensures both tables have consistent 'approved' status
            # First, ensure 'approved' is in the users.status enum
            try:
                cursor.execute("SHOW COLUMNS FROM users WHERE Field = 'status'")
                status_col = cursor.fetchone()
                if status_col:
                    enum_str = status_col[1] if isinstance(status_col, tuple) else status_col.get('Type', '')
                    if 'approved' not in enum_str.upper():
                        # Add 'approved' to the status ENUM if it doesn't exist
                        cursor.execute("""
                            ALTER TABLE users 
                            MODIFY COLUMN status ENUM('active', 'suspended', 'pending', 'rejected', 'approved', 'available', 'busy', 'offline') 
                            DEFAULT 'pending'
                        """)
                        print(f"[APPROVAL] Added 'approved' to users.status enum")
            except Exception as enum_error:
                print(f"[APPROVAL] Warning: Could not check/modify users.status enum: {enum_error}")
            
            # Now update the user status to 'approved'
            cursor.execute("UPDATE users SET role = %s, status = 'approved' WHERE id = %s", 
                      (application['application_type'], application['user_id']))
            user_rows_affected = cursor.rowcount
            print(f"[SELLER-APPROVAL] Updated user {application['user_id']} role to 'seller' and status to 'approved' (rows affected: {user_rows_affected})")
            
            # Verify the users.status update was successful
            if user_rows_affected == 0:
                print(f"[APPROVAL] WARNING: Failed to update users.status for user {application['user_id']} - no rows affected")
            else:
                # Double-check the status was actually set
                cursor.execute("SELECT status FROM users WHERE id = %s", (application['user_id'],))
                verify_user = cursor.fetchone()
                if verify_user:
                    actual_status = verify_user.get('status') if isinstance(verify_user, dict) else verify_user[0] if isinstance(verify_user, tuple) else None
                    if actual_status == 'approved':
                        print(f"[APPROVAL] Verified: User {application['user_id']} status is now 'approved'")
                    else:
                        print(f"[APPROVAL] WARNING: User {application['user_id']} status is '{actual_status}', expected 'approved'")
        
        # If seller approved, set seller shop address and coordinates from the registered business address
        if application['application_type'] == 'seller':
            try:
                # Get the user's address from the users table (stored during registration)
                cursor.execute("SELECT address FROM users WHERE id = %s", (application['user_id'],))
                user_result = cursor.fetchone()
                
                full_address = None
                address_data = {}
                
                if user_result and user_result.get('address'):
                    try:
                        # Parse the address JSON stored during registration
                        address_json = user_result['address']
                        if isinstance(address_json, str):
                            address_data = json.loads(address_json)
                        elif isinstance(address_json, dict):
                            address_data = address_json
                        
                        # Extract address components from the JSON structure
                        # The address is stored as: { "address": "...", "street": "...", "barangay": "...", "city": "...", "province": "...", "region": "...", "postal_code": "..." }
                        street = address_data.get('street', '')
                        barangay = address_data.get('barangay', '')
                        city = address_data.get('city', '')
                        province = address_data.get('province', '')
                        region = address_data.get('region', '')
                        postal_code = address_data.get('postal_code', '')
                        
                        # Build full address string in the same format as registration
                        address_parts = []
                        if street: address_parts.append(street)
                        if barangay: address_parts.append(barangay)
                        if city: address_parts.append(city)
                        if province: address_parts.append(province)
                        if region: address_parts.append(region)
                        if postal_code: address_parts.append(postal_code)
                        
                        full_address = ', '.join(address_parts) if address_parts else address_data.get('address')
                        
                        # Fallback to the 'address' field if it exists and we couldn't build from components
                        if not full_address:
                            full_address = address_data.get('address')
                            
                    except Exception as e:
                        print(f"[SELLER-GEO] Failed to parse address JSON: {e}")
                        # Fallback: try to use address as-is if it's a string
                        if isinstance(user_result['address'], str) and not user_result['address'].startswith('{'):
                            full_address = user_result['address']
                
                # Only attempt geocoding if we have an address string
                lat, lng = None, None
                if full_address:
                    lat, lng = geocode_with_nominatim(full_address)
                    print(f"[SELLER-GEO] Geocoded seller business address '{full_address}' -> lat={lat}, lng={lng}")
                
                # Update users table with coordinates (preserve existing address, only update coords)
                if lat is not None and lng is not None:
                    cursor.execute(
                        "UPDATE users SET location_lat = %s, location_lng = %s WHERE id = %s",
                        (lat, lng, application['user_id'])
                    )
                    print(f"[SELLER-GEO] Updated seller coordinates for user {application['user_id']}: ({lat}, {lng})")
                else:
                    print(f"[SELLER-GEO] Warning: Could not geocode address for seller {application['user_id']}. Address: {full_address}")
                
                # Store seller business address in user_addresses table for easy retrieval
                # This is important for pickup address display - store even if geocoding failed
                if full_address:
                    try:
                        # Check if business address already exists
                        cursor.execute("""
                            SELECT id FROM user_addresses 
                            WHERE user_id = %s AND label = 'Business Address'
                        """, (application['user_id'],))
                        existing = cursor.fetchone()
                        
                        if not existing:
                            # Build address_data if not already parsed
                            if not address_data and user_result and user_result.get('address'):
                                try:
                                    address_json = user_result['address']
                                    if isinstance(address_json, str):
                                        address_data = json.loads(address_json)
                                    elif isinstance(address_json, dict):
                                        address_data = address_json
                                except:
                                    address_data = {}
                            
                            # Extract components from address_data or parse from full_address string
                            street = address_data.get('street', '') if address_data else ''
                            barangay = address_data.get('barangay', '') if address_data else ''
                            city = address_data.get('city', '') if address_data else ''
                            province = address_data.get('province', '') if address_data else ''
                            region = address_data.get('region', '') if address_data else ''
                            postal_code = address_data.get('postal_code', '') if address_data else ''
                            region_code = address_data.get('region_code', '') if address_data else ''
                            province_code = address_data.get('province_code', '') if address_data else ''
                            city_code = address_data.get('city_code', '') if address_data else ''
                            barangay_code = address_data.get('barangay_code', '') if address_data else ''
                            
                            # If address_data is empty, try to parse from full_address string
                            if not street and not city and full_address:
                                # Simple parsing: try to extract components from full_address
                                parts = [p.strip() for p in full_address.split(',')]
                                if len(parts) >= 1:
                                    street = parts[0]
                                if len(parts) >= 2:
                                    barangay = parts[1]
                                if len(parts) >= 3:
                                    city = parts[2]
                                if len(parts) >= 4:
                                    province = parts[3]
                                if len(parts) >= 5:
                                    region = parts[4]
                            
                            # Insert business address into user_addresses (even if geocoding failed)
                            cursor.execute("""
                                INSERT INTO user_addresses (
                                    user_id, label, contact_name, contact_phone,
                                    region, region_code, province, province_code,
                                    city, city_code, barangay, barangay_code,
                                    street, postal_code, latitude, longitude, is_default
                                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """, (
                                application['user_id'],
                                'Business Address',
                                application.get('business_name') or 'Business',
                                application.get('business_phone') or '',
                                region,
                                region_code,
                                province,
                                province_code,
                                city,
                                city_code,
                                barangay,
                                barangay_code,
                                street,
                                postal_code,
                                lat,  # Can be None if geocoding failed
                                lng,  # Can be None if geocoding failed
                                1  # Set as default for business
                            ))
                            print(f"[SELLER-GEO] Stored business address in user_addresses for seller {application['user_id']}: {full_address}")
                    except Exception as e:
                        print(f"[SELLER-GEO] Error storing business address in user_addresses: {e}")
                        import traceback
                        traceback.print_exc()
            except Exception as e:
                print(f"[SELLER-GEO] Error updating seller location for user {application['user_id']}: {e}")
        
        # Commit all changes including the application status update
        connection.commit()
        print(f"[APPROVAL] Successfully committed approval for application {app_id}")
        
        # Verify both statuses were updated correctly
        cursor.execute("SELECT status FROM applications WHERE id = %s", (app_id,))
        verify_app = cursor.fetchone()
        app_status = verify_app.get('status') if verify_app and isinstance(verify_app, dict) else (verify_app[0] if verify_app and isinstance(verify_app, tuple) else None)
        
        if application['application_type'] == 'seller':
            cursor.execute("SELECT status FROM users WHERE id = %s", (application['user_id'],))
            verify_user = cursor.fetchone()
            user_status = verify_user.get('status') if verify_user and isinstance(verify_user, dict) else (verify_user[0] if verify_user and isinstance(verify_user, tuple) else None)
            
            if app_status == 'approved' and user_status == 'approved':
                print(f"[APPROVAL] ✓ Verified: Application {app_id} and User {application['user_id']} both have 'approved' status")
            else:
                print(f"[APPROVAL] ✗ WARNING: Status mismatch! Application status: '{app_status}', User status: '{user_status}'")
        else:
            if app_status == 'approved':
                print(f"[APPROVAL] ✓ Verified: Application {app_id} status is now 'approved'")
            else:
                print(f"[APPROVAL] ✗ WARNING: Application {app_id} status verification failed! Status: '{app_status}'")
        
        return jsonify({'success': True, 'message': 'Application approved successfully'})
        
    except Exception as e:
        connection.rollback()
        print(f"[APPROVAL] Error approving application {app_id}: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to approve application'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/admin/flash-sales', methods=['GET'])
@token_required
@admin_required
def admin_list_flash_sales(current_user):
    status = request.args.get('status', 'pending')  # pending|approved|declined|all
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = connection.cursor(dictionary=True)
    try:
        where = ["is_flash_sale = 1"]
        params = []
        if status and status != 'all':
            where.append("flash_sale_status = %s")
            params.append(status)
        query = f"SELECT id, name, description, image_url, flash_sale_status, seller_id, created_at FROM products WHERE {' AND '.join(where)} ORDER BY created_at DESC"
        cur.execute(query, params)
        rows = cur.fetchall() or []
        return jsonify({'success': True, 'items': rows})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close(); connection.close()

@app.route('/api/admin/flash-sales/<int:product_id>/approve', methods=['POST'])
@token_required
@admin_required
def admin_approve_flash_sale(current_user, product_id):
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = connection.cursor()
    try:
        cur.execute("UPDATE products SET flash_sale_status='approved', is_flash_sale=1 WHERE id=%s", (product_id,))
        connection.commit()
        return jsonify({'success': True, 'message': 'Flash sale approved'})
    except Exception as e:
        connection.rollback(); return jsonify({'error': str(e)}), 500
    finally:
        cur.close(); connection.close()

@app.route('/api/admin/flash-sales/<int:product_id>/decline', methods=['POST'])
@token_required
@admin_required
def admin_decline_flash_sale(current_user, product_id):
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = connection.cursor()
    try:
        cur.execute("UPDATE products SET flash_sale_status='declined', is_flash_sale=0 WHERE id=%s", (product_id,))
        connection.commit()
        return jsonify({'success': True, 'message': 'Flash sale declined'})
    except Exception as e:
        connection.rollback(); return jsonify({'error': str(e)}), 500
    finally:
        cur.close(); connection.close()

# ===== PRODUCT MODERATION (Admin) =====
@app.route('/api/admin/products', methods=['GET'])
@token_required
@admin_required
def admin_list_products_for_moderation(current_user):
    status = (request.args.get('status') or 'pending').lower()
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = connection.cursor(dictionary=True)
    try:
        where = []
        params = []
        if status in ('pending','approved','rejected'):
            where.append("p.approval_status = %s")
            params.append(status)
        # default shows pending if none provided
        where_sql = ("WHERE " + " AND ".join(where)) if where else "WHERE p.approval_status = 'pending'"
        query = f"""
            SELECT p.*, u.name as seller_name, u.email as seller_email
            FROM products p
            LEFT JOIN users u ON p.seller_id = u.id
            {where_sql}
            ORDER BY p.created_at DESC
        """
        cur.execute(query, params)
        rows = cur.fetchall() or []
        return jsonify({'success': True, 'products': rows})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close(); connection.close()

@app.route('/api/admin/products/<int:product_id>/approve', methods=['POST'])
@token_required
@admin_required
def admin_approve_product(current_user, product_id):
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = connection.cursor()
    try:
        cur.execute("UPDATE products SET approval_status='approved', is_active=1 WHERE id=%s", (product_id,))
        if cur.rowcount == 0:
            return jsonify({'error': 'Product not found'}), 404
        connection.commit()
        return jsonify({'success': True, 'message': 'Approved successfully.'})
    except Exception as e:
        connection.rollback(); return jsonify({'error': str(e)}), 500
    finally:
        cur.close(); connection.close()

@app.route('/api/admin/products/<int:product_id>', methods=['GET'])
@token_required
@admin_required
def admin_get_product_details(current_user, product_id):
    """Get product details for admin (including pending products)"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get product basic info with seller details (no is_active filter for admin)
        cursor.execute("""
            SELECT p.*, u.name as seller_name, u.id as seller_id, u.email as seller_email
            FROM products p
            LEFT JOIN users u ON p.seller_id = u.id
            WHERE p.id = %s
        """, (product_id,))
        
        product = cursor.fetchone()
        if not product:
            return jsonify({'error': 'Product not found'}), 404
        
        # Get variant images
        cursor.execute("""
            SELECT color, size, image_url, display_order
            FROM product_variant_images
            WHERE product_id = %s
            ORDER BY display_order ASC, id ASC
        """, (product_id,))
        variant_images = cursor.fetchall()
        
        # Get size/color/stock data (include all stock, not just > 0)
        # Sort sizes: numerical sizes (shoes, including decimals) first, then clothing sizes
        cursor.execute("""
            SELECT size, color, color_name, stock_quantity, price, discount_price
            FROM product_size_stock
            WHERE product_id = %s
            ORDER BY 
                CASE 
                    WHEN size REGEXP '^[0-9]+(\\.[0-9]+)?$' THEN CAST(size AS DECIMAL(10,2))
                    WHEN size = 'XS' THEN 1000
                    WHEN size = 'S' THEN 1001
                    WHEN size = 'M' THEN 1002
                    WHEN size = 'L' THEN 1003
                    WHEN size = 'XL' THEN 1004
                    WHEN size = 'XXL' THEN 1005
                    ELSE 9999
                END
        """, (product_id,))
        size_stock_data = cursor.fetchall()
        
        # Organize size/color stock data
        size_color_stock = {}
        total_stock = 0
        
        for item in size_stock_data:
            size = item['size']
            color = item['color']
            color_name = item.get('color_name', color)
            stock = int(item['stock_quantity'] or 0)
            price = float(item['price'] or 0)
            discount_price = float(item['discount_price']) if item.get('discount_price') else None
            
            if size not in size_color_stock:
                size_color_stock[size] = {}
            
            size_color_stock[size][color] = {
                'name': color_name,
                'stock': stock,
                'price': price,
                'discount_price': discount_price
            }
            total_stock += stock
        
        # Build product response
        product_data = {
            'id': product['id'],
            'name': product['name'],
            'description': product.get('description', ''),
            'category': product.get('category', ''),
            'price': float(product.get('price') or 0),
            'image_url': product.get('image_url', ''),
            'total_stock': total_stock,
            'is_flash_sale': bool(product.get('is_flash_sale', False)),
            'seller_name': product.get('seller_name', 'Unknown'),
            'seller_id': product.get('seller_id'),
            'seller_email': product.get('seller_email', ''),
            'approval_status': product.get('approval_status', 'pending'),
            'is_active': bool(product.get('is_active', False)),
            'size_color_stock': size_color_stock,
            'variant_images': variant_images,
            'created_at': product['created_at'].isoformat() if product.get('created_at') else None,
            'updated_at': product['updated_at'].isoformat() if product.get('updated_at') else None
        }
        
        return jsonify({
            'success': True,
            'product': product_data
        })
        
    except Exception as e:
        print(f"Error fetching product {product_id} for admin: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/admin/products/<int:product_id>/reject', methods=['POST'])
@token_required
@admin_required
def admin_reject_product(current_user, product_id):
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = connection.cursor()
    try:
        # keep product hidden
        cur.execute("UPDATE products SET approval_status='rejected', is_active=0 WHERE id=%s", (product_id,))
        if cur.rowcount == 0:
            return jsonify({'error': 'Product not found'}), 404
        connection.commit()
        return jsonify({'success': True, 'message': 'Product rejected'})
    except Exception as e:
        connection.rollback(); return jsonify({'error': str(e)}), 500
    finally:
        cur.close(); connection.close()

# ===== SELLER PRODUCTS & SALES (Admin) =====
@app.route('/api/admin/sellers/products-sales', methods=['GET'])
@token_required
@admin_required
def get_sellers_products_sales(current_user):
    """Get all sellers with their products and sales performance"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get all sellers with their product counts and sales
        cursor.execute("""
            SELECT 
                u.id as seller_id,
                u.name as seller_name,
                u.email as seller_email,
                u.created_at as seller_joined,
                COUNT(DISTINCT p.id) as total_products,
                COUNT(DISTINCT CASE WHEN p.is_active = 1 THEN p.id END) as active_products,
                COALESCE(SUM(oi.quantity * oi.price), 0) as total_sales,
                COUNT(DISTINCT o.id) as total_orders,
                COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN oi.quantity * oi.price ELSE 0 END), 0) as completed_sales
            FROM users u
            LEFT JOIN products p ON u.id = p.seller_id
            LEFT JOIN order_items oi ON p.id = oi.product_id
            LEFT JOIN orders o ON oi.order_id = o.id
            WHERE u.role = 'seller'
            GROUP BY u.id, u.name, u.email, u.created_at
            ORDER BY total_sales DESC, u.name ASC
        """)
        
        sellers = cursor.fetchall()
        
        # Format response
        sellers_data = []
        for seller in sellers:
            sellers_data.append({
                'seller_id': seller['seller_id'],
                'seller_name': seller['seller_name'],
                'seller_email': seller['seller_email'],
                'seller_joined': seller['seller_joined'].isoformat() if seller.get('seller_joined') else None,
                'total_products': seller['total_products'] or 0,
                'active_products': seller['active_products'] or 0,
                'total_sales': float(seller['total_sales'] or 0),
                'total_orders': seller['total_orders'] or 0,
                'completed_sales': float(seller['completed_sales'] or 0)
            })
        
        return jsonify({
            'success': True,
            'sellers': sellers_data
        })
        
    except Exception as e:
        print(f"Error fetching sellers products sales: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/admin/sellers/<int:seller_id>/products', methods=['GET'])
@token_required
@admin_required
def get_seller_products_admin(current_user, seller_id):
    """Get all products for a specific seller"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Verify seller exists
        cursor.execute("SELECT id, name, email FROM users WHERE id = %s AND role = 'seller'", (seller_id,))
        seller = cursor.fetchone()
        if not seller:
            return jsonify({'error': 'Seller not found'}), 404
        
        # Get all products for this seller
        cursor.execute("""
            SELECT 
                p.*,
                COALESCE(SUM(oi.quantity), 0) as total_sold,
                COALESCE(SUM(oi.quantity * oi.price), 0) as total_revenue
            FROM products p
            LEFT JOIN order_items oi ON p.id = oi.product_id
            WHERE p.seller_id = %s
            GROUP BY p.id
            ORDER BY p.created_at DESC
        """, (seller_id,))
        
        products = cursor.fetchall()
        
        products_data = []
        for product in products:
            products_data.append({
                'id': product['id'],
                'name': product['name'],
                'price': float(product.get('price') or 0),
                'image_url': product.get('image_url', ''),
                'is_active': bool(product.get('is_active', False)),
                'approval_status': product.get('approval_status', 'pending'),
                'total_sold': int(product['total_sold'] or 0),
                'total_revenue': float(product['total_revenue'] or 0),
                'created_at': product['created_at'].isoformat() if product.get('created_at') else None
            })
        
        return jsonify({
            'success': True,
            'seller': {
                'id': seller['id'],
                'name': seller['name'],
                'email': seller['email']
            },
            'products': products_data
        })
        
    except Exception as e:
        print(f"Error fetching seller products: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

# ===== PRODUCT MANAGEMENT (Admin) =====
@app.route('/api/admin/products/all', methods=['GET'])
@token_required
@admin_required
def get_all_products_admin(current_user):
    """Get all products from all sellers with pagination and filters"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        page = request.args.get('page', 1, type=int)
        limit = request.args.get('limit', 20, type=int)
        offset = (page - 1) * limit
        search = request.args.get('search', '')
        status_filter = request.args.get('status', 'all')  # all, active, inactive, pending, rejected
        
        where_clauses = []
        params = []
        
        if search:
            where_clauses.append("(p.name LIKE %s OR p.description LIKE %s OR u.name LIKE %s)")
            params.extend([f'%{search}%', f'%{search}%', f'%{search}%'])
        
        if status_filter == 'active':
            where_clauses.append("p.is_active = 1 AND p.approval_status = 'approved'")
        elif status_filter == 'inactive':
            where_clauses.append("p.is_active = 0")
        elif status_filter == 'pending':
            where_clauses.append("p.approval_status = 'pending'")
        elif status_filter == 'rejected':
            where_clauses.append("p.approval_status = 'rejected'")
        
        where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""
        
        # Get products
        query = f"""
            SELECT 
                p.*,
                u.name as seller_name,
                u.email as seller_email,
                COALESCE(SUM(oi.quantity), 0) as total_sold,
                COALESCE(SUM(oi.quantity * oi.price), 0) as total_revenue
            FROM products p
            LEFT JOIN users u ON p.seller_id = u.id
            LEFT JOIN order_items oi ON p.id = oi.product_id
            {where_sql}
            GROUP BY p.id
            ORDER BY p.created_at DESC
            LIMIT %s OFFSET %s
        """
        params.extend([limit, offset])
        cursor.execute(query, params)
        products = cursor.fetchall()
        
        # Get total count
        count_query = f"""
            SELECT COUNT(DISTINCT p.id) as total
            FROM products p
            LEFT JOIN users u ON p.seller_id = u.id
            {where_sql}
        """
        count_params = params[:-2]  # Remove limit and offset
        cursor.execute(count_query, count_params)
        total = cursor.fetchone()['total']
        
        products_data = []
        for product in products:
            products_data.append({
                'id': product['id'],
                'name': product['name'],
                'description': product.get('description', ''),
                'price': float(product.get('price') or 0),
                'image_url': product.get('image_url', ''),
                'is_active': bool(product.get('is_active', False)),
                'approval_status': product.get('approval_status', 'pending'),
                'seller_id': product.get('seller_id'),
                'seller_name': product.get('seller_name', 'Unknown'),
                'seller_email': product.get('seller_email', ''),
                'total_sold': int(product['total_sold'] or 0),
                'total_revenue': float(product['total_revenue'] or 0),
                'created_at': product['created_at'].isoformat() if product.get('created_at') else None,
                'updated_at': product['updated_at'].isoformat() if product.get('updated_at') else None
            })
        
        return jsonify({
            'success': True,
            'products': products_data,
            'total': total,
            'page': page,
            'limit': limit
        })
        
    except Exception as e:
        print(f"Error fetching all products: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/admin/products/<int:product_id>/update', methods=['PUT'])
@token_required
@admin_required
def admin_update_product(current_user, product_id):
    """Admin can update product details, hide/unhide, or delete"""
    data = request.get_json() or {}
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Check if product exists
        cursor.execute("SELECT id, seller_id FROM products WHERE id = %s", (product_id,))
        product = cursor.fetchone()
        if not product:
            return jsonify({'error': 'Product not found'}), 404
        
        # Handle delete
        if data.get('action') == 'delete':
            cursor.execute("DELETE FROM products WHERE id = %s", (product_id,))
            connection.commit()
            return jsonify({'success': True, 'message': 'Product deleted successfully'})
        
        # Handle hide/unhide
        if 'is_active' in data:
            cursor.execute("UPDATE products SET is_active = %s WHERE id = %s", 
                         (1 if data['is_active'] else 0, product_id))
            connection.commit()
            return jsonify({
                'success': True, 
                'message': 'Product ' + ('activated' if data['is_active'] else 'hidden') + ' successfully'
            })
        
        # Handle update product details
        update_fields = []
        update_values = []
        
        allowed_fields = ['name', 'description', 'price', 'category']
        for field in allowed_fields:
            if field in data:
                update_fields.append(f"{field} = %s")
                update_values.append(data[field])
        
        if update_fields:
            update_values.append(product_id)
            query = f"UPDATE products SET {', '.join(update_fields)} WHERE id = %s"
            cursor.execute(query, update_values)
            connection.commit()
            return jsonify({'success': True, 'message': 'Product updated successfully'})
        
        return jsonify({'error': 'No valid fields to update'}), 400
        
    except Exception as e:
        connection.rollback()
        print(f"Error updating product: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

# ===== RIDER MANAGEMENT (Admin) =====
@app.route('/api/admin/riders', methods=['GET'])
@token_required
@admin_required
def get_all_riders_admin(current_user):
    """Get all riders with performance data"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        cursor.execute("""
            SELECT 
                u.id as rider_id,
                u.name as rider_name,
                u.email as rider_email,
                u.phone as rider_phone,
                u.created_at as rider_joined,
                COUNT(DISTINCT d.id) as total_deliveries,
                COUNT(DISTINCT CASE WHEN d.status = 'delivered' THEN d.id END) as completed_deliveries,
                COUNT(DISTINCT CASE WHEN d.status IN ('assigned', 'in_transit') THEN d.id END) as active_deliveries,
                COALESCE(SUM(CASE WHEN d.status = 'delivered' THEN d.base_fee + d.distance_bonus + d.tips + d.peak_bonus ELSE 0 END), 0) as total_earnings,
                COALESCE(AVG(CASE WHEN d.status = 'delivered' AND d.rating IS NOT NULL THEN d.rating END), 0) as average_rating
            FROM users u
            LEFT JOIN deliveries d ON u.id = d.rider_id
            WHERE u.role = 'rider'
            GROUP BY u.id, u.name, u.email, u.phone, u.created_at
            ORDER BY total_earnings DESC, u.name ASC
        """)
        
        riders = cursor.fetchall()
        
        riders_data = []
        for rider in riders:
            riders_data.append({
                'rider_id': rider['rider_id'],
                'rider_name': rider['rider_name'],
                'rider_email': rider['rider_email'],
                'rider_phone': rider.get('rider_phone', ''),
                'rider_joined': rider['rider_joined'].isoformat() if rider.get('rider_joined') else None,
                'total_deliveries': rider['total_deliveries'] or 0,
                'completed_deliveries': rider['completed_deliveries'] or 0,
                'active_deliveries': rider['active_deliveries'] or 0,
                'total_earnings': float(rider['total_earnings'] or 0),
                'average_rating': float(rider['average_rating'] or 0)
            })
        
        return jsonify({
            'success': True,
            'riders': riders_data
        })
        
    except Exception as e:
        print(f"Error fetching riders: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/admin/riders/<int:rider_id>/performance', methods=['GET'])
@token_required
@admin_required
def get_rider_performance_admin(current_user, rider_id):
    """Get detailed performance metrics for a specific rider"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Verify rider exists
        cursor.execute("SELECT id, name, email, phone FROM users WHERE id = %s AND role = 'rider'", (rider_id,))
        rider = cursor.fetchone()
        if not rider:
            return jsonify({'error': 'Rider not found'}), 404
        
        # Get delivery assignments
        cursor.execute("""
            SELECT 
                d.*,
                o.order_number,
                o.total_amount,
                u.name as customer_name,
                u.phone as customer_phone
            FROM deliveries d
            LEFT JOIN orders o ON d.order_id = o.id
            LEFT JOIN users u ON o.buyer_id = u.id
            WHERE d.rider_id = %s
            ORDER BY d.created_at DESC
            LIMIT 50
        """, (rider_id,))
        
        deliveries = cursor.fetchall()
        
        # Get earnings report (daily)
        cursor.execute("""
            SELECT 
                DATE(completed_at) as date,
                COUNT(*) as deliveries_count,
                SUM(base_fee + distance_bonus + tips + peak_bonus) as daily_earnings
            FROM deliveries
            WHERE rider_id = %s AND status = 'delivered' AND completed_at IS NOT NULL
            GROUP BY DATE(completed_at)
            ORDER BY date DESC
            LIMIT 30
        """, (rider_id,))
        
        earnings_data = cursor.fetchall()
        
        deliveries_list = []
        for delivery in deliveries:
            deliveries_list.append({
                'id': delivery['id'],
                'order_number': delivery.get('order_number', ''),
                'status': delivery['status'],
                'customer_name': delivery.get('customer_name', ''),
                'customer_phone': delivery.get('customer_phone', ''),
                'total_amount': float(delivery.get('total_amount', 0)),
                'earnings': float((delivery.get('base_fee') or 0) + (delivery.get('distance_bonus') or 0) + 
                                 (delivery.get('tips') or 0) + (delivery.get('peak_bonus') or 0)),
                'created_at': delivery['created_at'].isoformat() if delivery.get('created_at') else None,
                'completed_at': delivery['completed_at'].isoformat() if delivery.get('completed_at') else None
            })
        
        earnings_list = []
        for earning in earnings_data:
            earnings_list.append({
                'date': earning['date'].isoformat() if earning.get('date') else None,
                'deliveries_count': earning['deliveries_count'] or 0,
                'daily_earnings': float(earning['daily_earnings'] or 0)
            })
        
        return jsonify({
            'success': True,
            'rider': {
                'id': rider['id'],
                'name': rider['name'],
                'email': rider['email'],
                'phone': rider.get('phone', '')
            },
            'deliveries': deliveries_list,
            'earnings': earnings_list
        })
        
    except Exception as e:
        print(f"Error fetching rider performance: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

# ===== ORDER MANAGEMENT IMPROVEMENTS (Admin) =====
@app.route('/api/admin/orders/<int:order_id>/force-update', methods=['PUT'])
@token_required
@admin_required
def force_update_order_status_admin(current_user, order_id):
    """Admin can force update any order status"""
    data = request.get_json() or {}
    new_status = data.get('status')
    
    if not new_status:
        return jsonify({'error': 'Status is required'}), 400
    
    allowed_statuses = ['pending', 'confirmed', 'prepared', 'shipped', 'delivered', 'cancelled']
    if new_status not in allowed_statuses:
        return jsonify({'error': 'Invalid status'}), 400
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get current order
        cursor.execute("SELECT id, status, order_number FROM orders WHERE id = %s", (order_id,))
        order = cursor.fetchone()
        if not order:
            return jsonify({'error': 'Order not found'}), 404
        
        # Update status
        cursor.execute("UPDATE orders SET status = %s WHERE id = %s", (new_status, order_id))
        connection.commit()
        
        return jsonify({
            'success': True,
            'message': f'Order status updated from {order["status"]} to {new_status}',
            'order': {
                'id': order_id,
                'order_number': order['order_number'],
                'status': new_status
            }
        })
        
    except Exception as e:
        connection.rollback()
        print(f"Error force updating order status: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/admin/orders/<int:order_id>/refund', methods=['POST'])
@token_required
@admin_required
def process_refund_admin(current_user, order_id):
    """Process refund for an order"""
    data = request.get_json() or {}
    refund_amount = data.get('refund_amount')
    refund_reason = data.get('refund_reason', 'Admin refund')
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get order details
        cursor.execute("""
            SELECT id, order_number, total_amount, payment_status, status
            FROM orders WHERE id = %s
        """, (order_id,))
        order = cursor.fetchone()
        
        if not order:
            return jsonify({'error': 'Order not found'}), 404
        
        if order['payment_status'] != 'paid':
            return jsonify({'error': 'Order is not paid, cannot process refund'}), 400
        
        # Use provided refund amount or full amount
        amount = float(refund_amount) if refund_amount else float(order['total_amount'])
        
        # Update order status and add refund record
        # Note: If refund_amount, refund_reason, refunded_at columns don't exist, 
        # this will still work by just updating status and payment_status
        try:
            cursor.execute("""
                UPDATE orders 
                SET status = 'cancelled', 
                    payment_status = 'refunded',
                    refund_amount = %s,
                    refund_reason = %s,
                    refunded_at = NOW()
                WHERE id = %s
            """, (amount, refund_reason, order_id))
        except Exception as e:
            # If refund columns don't exist, just update status and payment_status
            if 'refund_amount' in str(e) or 'refund_reason' in str(e) or 'refunded_at' in str(e):
                cursor.execute("""
                    UPDATE orders 
                    SET status = 'cancelled', 
                        payment_status = 'refunded'
                    WHERE id = %s
                """, (order_id,))
            else:
                raise
        
        connection.commit()
        
        return jsonify({
            'success': True,
            'message': f'Refund of ₱{amount:.2f} processed successfully',
            'order': {
                'id': order_id,
                'order_number': order['order_number'],
                'refund_amount': amount,
                'refund_reason': refund_reason
            }
        })
        
    except Exception as e:
        connection.rollback()
        print(f"Error processing refund: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/admin/applications/<int:app_id>/reject', methods=['POST'])
@token_required
@admin_required
def reject_application(current_user, app_id):
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Check if application exists
        cursor.execute("SELECT * FROM applications WHERE id = %s", (app_id,))
        application = cursor.fetchone()
        
        if not application:
            return jsonify({'error': 'Application not found'}), 404
        
        # Update application status to 'rejected'
        cursor.execute("UPDATE applications SET status = 'rejected', updated_at = NOW() WHERE id = %s", (app_id,))
        print(f"[REJECTION] Updated application {app_id} status to 'rejected' for user {application['user_id']}")
        
        connection.commit()
        
        # Verify the status was updated correctly
        cursor.execute("SELECT status FROM applications WHERE id = %s", (app_id,))
        verify_app = cursor.fetchone()
        if verify_app and verify_app['status'] == 'rejected':
            print(f"[REJECTION] Verified: Application {app_id} status is now 'rejected'")
        
        return jsonify({'success': True, 'message': 'Application rejected'})
        
    except Exception as e:
        connection.rollback()
        print(f"[REJECTION] Error rejecting application {app_id}: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to reject application'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/admin/sellers/<int:user_id>/enforce', methods=['POST'])
@token_required
@admin_required
def admin_enforce_seller(current_user, user_id):
    data = request.get_json() or {}
    action = (data.get('action') or '').lower()
    reason = (data.get('reason') or '').strip()
    duration_days = data.get('duration_days')

    if action not in ['warn', 'suspend', 'disable']:
        return jsonify({'error': 'Invalid action. Use warn, suspend, or disable.'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = conn.cursor(dictionary=True)

    try:
        # Validate target user
        cur.execute("SELECT id, role, status, is_active FROM users WHERE id=%s", (user_id,))
        target = cur.fetchone()
        if not target:
            return jsonify({'error': 'User not found'}), 404
        if target['role'] == 'admin':
            return jsonify({'error': 'Cannot enforce actions on admin accounts'}), 403

        expires_at = None
        if action == 'warn':
            # Log action and notify
            cur2 = conn.cursor()
            cur2.execute("""
                INSERT INTO user_enforcement_actions (user_id, admin_id, action, reason)
                VALUES (%s, %s, 'warn', %s)
            """, (user_id, current_user['id'], reason or 'Warning issued'))
            cur2.close()
            create_notification(user_id, 'warning', reason or 'You have received a warning from admin')
        elif action == 'suspend':
            # Duration in days optional
            try:
                dd = int(duration_days) if duration_days is not None else None
            except Exception:
                dd = None
            if dd and dd > 0:
                expires_at = datetime.now() + timedelta(days=dd)
            # Update user status
            up = conn.cursor()
            up.execute("UPDATE users SET status='suspended', suspension_expires_at=%s WHERE id=%s", (expires_at, user_id))
            up.close()
            # Log
            cur2 = conn.cursor()
            cur2.execute("""
                INSERT INTO user_enforcement_actions (user_id, admin_id, action, reason, duration_days, expires_at)
                VALUES (%s, %s, 'suspend', %s, %s, %s)
            """, (user_id, current_user['id'], reason or 'Suspended', dd, expires_at))
            cur2.close()
            msg = f"Your account has been suspended{f' for {dd} day(s)' if dd else ''}. Reason: {reason or 'Policy violation'}"
            create_notification(user_id, 'suspension', msg)
        elif action == 'disable':
            up = conn.cursor()
            up.execute("UPDATE users SET is_active=0, status='suspended' WHERE id=%s", (user_id,))
            up.close()
            cur2 = conn.cursor()
            cur2.execute("""
                INSERT INTO user_enforcement_actions (user_id, admin_id, action, reason)
                VALUES (%s, %s, 'disable', %s)
            """, (user_id, current_user['id'], reason or 'Account disabled'))
            cur2.close()
            create_notification(user_id, 'account_disabled', reason or 'Your account has been disabled by admin')

        conn.commit()
        return jsonify({'success': True, 'message': f'Action {action} applied successfully', 'expires_at': (expires_at.isoformat() if expires_at else None)})
    except Exception as e:
        conn.rollback(); print(f"[ENFORCE] error: {e}")
        return jsonify({'error': 'Failed to apply action'}), 500
    finally:
        cur.close(); conn.close()

@app.route('/api/admin/sellers/<int:user_id>/reinstate', methods=['POST'])
@token_required
@admin_required
def admin_reinstate_seller(current_user, user_id):
    data = request.get_json() or {}
    reason = (data.get('reason') or '').strip()

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = conn.cursor()
    try:
        cur.execute("UPDATE users SET is_active=1, status='active', suspension_expires_at=NULL WHERE id=%s", (user_id,))
        cur2 = conn.cursor()
        cur2.execute("""
            INSERT INTO user_enforcement_actions (user_id, admin_id, action, reason)
            VALUES (%s, %s, 'reinstate', %s)
        """, (user_id, current_user['id'], reason or 'Account reinstated'))
        cur2.close()
        conn.commit()
        create_notification(user_id, 'account_reinstated', reason or 'Your account has been reinstated')
        return jsonify({'success': True, 'message': 'Seller reinstated successfully'})
    except Exception as e:
        conn.rollback(); print(f"[REINSTATE] error: {e}")
        return jsonify({'error': 'Failed to reinstate seller'}), 500
    finally:
        cur.close(); conn.close()

@app.route('/api/admin/users', methods=['GET'])
@token_required
@admin_required
def get_all_users(current_user):
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 10, type=int)
    role_filter = request.args.get('role')
    status_filter = request.args.get('status')
    search_query = request.args.get('search')
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    # Build query conditions
    where_clauses = ["u.role != 'admin'"]
    params = []
    
    if role_filter:
        where_clauses.append("u.role = %s")
        params.append(role_filter)
    
    if status_filter:
        where_clauses.append("u.status = %s")
        params.append(status_filter)
    
    if search_query:
        where_clauses.append("(u.name LIKE %s OR u.email LIKE %s)")
        params.extend([f"%{search_query}%", f"%{search_query}%"])
    
    where_sql = " AND ".join(where_clauses)
    
    # Get total count
    cursor.execute(f"SELECT COUNT(*) as total FROM users u WHERE {where_sql}", params)
    total = cursor.fetchone()['total']
    
    # Get users with pagination
    offset = (page - 1) * limit
    cursor.execute(f"""
        SELECT u.*, 
               COALESCE(order_stats.total_orders, 0) as total_orders,
               COALESCE(order_stats.total_spent, 0) as total_spent,
               COALESCE(seller_stats.total_sales, 0) as total_sales
        FROM users u
        LEFT JOIN (
            SELECT buyer_id, COUNT(*) as total_orders, SUM(total_amount) as total_spent
            FROM orders GROUP BY buyer_id
        ) order_stats ON u.id = order_stats.buyer_id
        LEFT JOIN (
            SELECT p.seller_id, SUM(oi.price * oi.quantity) as total_sales
            FROM products p
            JOIN order_items oi ON p.id = oi.product_id
            GROUP BY p.seller_id
        ) seller_stats ON u.id = seller_stats.seller_id
        WHERE {where_sql}
        ORDER BY u.created_at DESC
        LIMIT %s OFFSET %s
    """, params + [limit, offset])
    
    users = cursor.fetchall()
    cursor.close()
    connection.close()
    
    total_pages = (total + limit - 1) // limit
    
    return jsonify({
        'success': True,
'users': [{
            'id': user['id'],
            'name': user['name'],
            'suffix': user.get('suffix'),
            'email': user['email'],
            'role': user['role'],
            'status': user['status'],
            'phone': user.get('phone'),
            'address': user.get('address'),
            'gender': user.get('gender'),
            'birthday': user.get('birthday').isoformat() if user.get('birthday') else None,
            'id_document': user.get('id_document'),
            'id_document_url': (user.get('id_document') if user.get('id_document') else None),
            'created_at': user['created_at'].isoformat() if user['created_at'] else None,
            'last_login': user['last_login'].isoformat() if user['last_login'] else None,
            'total_orders': user['total_orders'],
            'total_spent': float(user['total_spent']) if user['total_spent'] else 0,
            'total_sales': float(user['total_sales']) if user['total_sales'] else 0
        } for user in users],
        'total': total,
        'total_pages': total_pages,
        'current_page': page
    })

@app.route('/api/admin/users/<int:user_id>', methods=['GET', 'DELETE'])
@token_required
@admin_required
def manage_user(current_user, user_id):
    if request.method == 'DELETE':
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        cursor = connection.cursor(dictionary=True)
        try:
            if user_id == current_user['id']:
                return jsonify({'error': 'You cannot delete your own account'}), 400
            cursor.execute("SELECT id, name FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
            connection.commit()
            return jsonify({'success': True, 'message': 'User deleted successfully'})
        except Exception as e:
            connection.rollback()
            return jsonify({'error': str(e)}), 500
        finally:
            cursor.close()
            connection.close()
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    # Get user details
    cursor.execute("""
        SELECT u.*, 
               COALESCE(order_stats.total_orders, 0) as total_orders,
               COALESCE(order_stats.total_spent, 0) as total_spent,
               COALESCE(seller_stats.total_sales, 0) as total_sales
        FROM users u
        LEFT JOIN (
            SELECT buyer_id, COUNT(*) as total_orders, SUM(total_amount) as total_spent
            FROM orders GROUP BY buyer_id
        ) order_stats ON u.id = order_stats.buyer_id
        LEFT JOIN (
            SELECT p.seller_id, SUM(oi.price * oi.quantity) as total_sales
            FROM products p
            JOIN order_items oi ON p.id = oi.product_id
            GROUP BY p.seller_id
        ) seller_stats ON u.id = seller_stats.seller_id
        WHERE u.id = %s
    """, (user_id,))
    
    user = cursor.fetchone()
    
    if not user:
        cursor.close()
        connection.close()
        return jsonify({'error': 'User not found'}), 404
    
    # Get recent orders
    cursor.execute("""
        SELECT id, order_number, total_amount, status, created_at
        FROM orders
        WHERE buyer_id = %s
        ORDER BY created_at DESC
        LIMIT 5
    """, (user_id,))
    
    recent_orders = cursor.fetchall()
    cursor.close()
    connection.close()
    
    return jsonify({
        'success': True,
'user': {
            'id': user['id'],
            'name': user['name'],
            'suffix': user.get('suffix'),
            'email': user['email'],
            'role': user['role'],
            'status': user['status'],
            'phone': user.get('phone'),
            'address': user.get('address'),
            'gender': user.get('gender'),
            'birthday': user.get('birthday').isoformat() if user.get('birthday') else None,
            'id_document': user.get('id_document'),
            'id_document_url': (user.get('id_document') if user.get('id_document') else None),
            'created_at': user['created_at'].isoformat() if user['created_at'] else None,
            'last_login': user['last_login'].isoformat() if user['last_login'] else None,
            'total_orders': user['total_orders'],
            'total_spent': float(user['total_spent']) if user['total_spent'] else 0,
            'total_sales': float(user['total_sales']) if user['total_sales'] else 0,
            'recent_orders': [{
                'id': order['id'],
                'order_number': order['order_number'],
                'total': float(order['total_amount']),
                'status': order['status'],
                'created_at': order['created_at'].isoformat() if order['created_at'] else None
            } for order in recent_orders]
        }
    })

@app.route('/api/admin/users/<int:user_id>/role', methods=['PUT'])
@token_required
@admin_required
def change_user_role(current_user, user_id):
    data = request.get_json()
    new_role = data.get('role')
    
    if new_role not in ['buyer', 'seller', 'rider', 'admin']:
        return jsonify({'error': 'Invalid role'}), 400
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor()
    cursor.execute("UPDATE users SET role = %s WHERE id = %s", (new_role, user_id))
    connection.commit()
    cursor.close()
    connection.close()
    
    return jsonify({'success': True, 'message': 'User role updated successfully'})

@app.route('/api/admin/users/bulk-status', methods=['PUT'])
@token_required
@admin_required
def bulk_update_user_status(current_user):
     data = request.get_json()
     user_ids = data.get('user_ids', [])
     status = data.get('status')
     
     if not user_ids or status not in ['active', 'suspended']:
         return jsonify({'error': 'Invalid parameters'}), 400
     
     connection = get_db_connection()
     if not connection:
         return jsonify({'error': 'Database connection failed'}), 500
     
     cursor = connection.cursor()
     placeholders = ','.join(['%s'] * len(user_ids))
     cursor.execute(f"UPDATE users SET status = %s WHERE id IN ({placeholders})", 
                   [status] + user_ids)
     connection.commit()
     cursor.close()
     connection.close()
     
     return jsonify({'success': True, 'message': f'{len(user_ids)} users updated successfully'})

@app.route('/api/admin/orders', methods=['GET'])
@token_required
@admin_required
def get_admin_orders(current_user):
    limit = request.args.get('limit', 10, type=int)
    page = request.args.get('page', 1, type=int)
    offset = (page - 1) * limit
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get orders with user details
        cursor.execute("""
            SELECT o.*, u.name as buyer_name
            FROM orders o
            LEFT JOIN users u ON o.buyer_id = u.id
            ORDER BY o.created_at DESC
            LIMIT %s OFFSET %s
        """, (limit, offset))
        
        orders = cursor.fetchall()
        
        # Get total count
        cursor.execute("SELECT COUNT(*) as total FROM orders")
        total = cursor.fetchone()['total']
        
        formatted_orders = []
        for order in orders:
            # Get order items
            cursor.execute("""
                SELECT oi.*, p.name as product_name, p.image_url,
                       u.name as seller_name, u.email as seller_email
                FROM order_items oi
                LEFT JOIN products p ON oi.product_id = p.id
                LEFT JOIN users u ON p.seller_id = u.id
                WHERE oi.order_id = %s
            """, (order['id'],))
            items = cursor.fetchall()
            
            # Calculate admin commission (5% of product subtotal)
            product_subtotal = sum(float(item['price'] * item['quantity']) for item in items)
            admin_commission = product_subtotal * 0.05
            seller_earnings = product_subtotal - admin_commission
            
            # Get shipping address
            address_parts = []
            if order.get('address'):
                address_parts.append(order['address'])
            if order.get('city'):
                address_parts.append(order['city'])
            if order.get('postal_code'):
                address_parts.append(order['postal_code'])
            full_address = ', '.join(address_parts) if address_parts else None
            
            formatted_orders.append({
                'id': order['id'],
                'order_number': order['order_number'],
                'full_name': order['full_name'],
                'buyer_name': order.get('buyer_name'),
                'email': order['email'],
                'phone': order.get('phone'),
                'address': full_address or order.get('address'),
                'city': order.get('city'),
                'postal_code': order.get('postal_code'),
                'total_amount': float(order['total_amount']),
                'status': order['status'],
                'payment_status': order['payment_status'],
                'created_at': order['created_at'].isoformat() if order['created_at'] else None,
                'items': [{
                    'id': item['id'],
                    'product_id': item['product_id'],
                    'name': item['product_name'],
                    'quantity': item['quantity'],
                    'price': float(item['price']),
                    'subtotal': float(item['price'] * item['quantity']),
                    'image_url': item.get('image_url') or '',
                    'size': item.get('size', ''),
                    'color': item.get('color', ''),
                    'seller_name': item.get('seller_name', 'Unknown Seller')
                } for item in items],
                'admin_commission': admin_commission,
                'seller_earnings': seller_earnings,
                'product_subtotal': product_subtotal
            })
        
        return jsonify({
            'success': True,
            'orders': formatted_orders,
            'total': total,
            'page': page,
            'limit': limit
        })
        
    except Exception as e:
        print(f"Error fetching admin orders: {str(e)}")
        return jsonify({'error': 'Failed to fetch orders'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/applications/seller', methods=['POST'])
@token_required
def submit_seller_application(current_user):
    # FIXED: Allow any user to apply to become a seller, regardless of current role
    # This is the key fix - removing the role restriction completely

    # Accept both JSON and multipart form submissions
    if request.content_type and 'multipart/form-data' in request.content_type.lower():
        data = request.form.to_dict(flat=True)
    else:
        data = request.get_json(silent=True) or {}

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = connection.cursor()

    try:
        # Check if application already exists for this user (prevent duplicates)
        # ENHANCED: Check for ANY pending application (seller OR rider)
        cursor.execute("""
            SELECT id, status, created_at, application_type FROM applications 
            WHERE user_id = %s AND status IN ('pending', 'approved')
            ORDER BY created_at DESC
            LIMIT 1
        """, (current_user['id'],))
        existing_app = cursor.fetchone()

        if existing_app:
            cursor.close()
            connection.close()
            status = existing_app[1]  # status is at index 1
            created_at = existing_app[2]  # created_at is at index 2
            app_type = existing_app[3]  # application_type is at index 3

            if status == 'pending':
                if app_type == 'seller':
                    return jsonify({
                        'error': 'You have already submitted a seller application that is currently pending review.',
                        'details': f'Application submitted on {created_at.strftime("%B %d, %Y")}. Please wait for admin review before submitting another application.',
                        'status': 'pending',
                        'application_type': 'seller',
                        'application_date': created_at.isoformat()
                    }), 400
                else:  # app_type == 'rider'
                    return jsonify({
                        'error': 'You have a pending rider application that must be reviewed first.',
                        'details': f'You submitted a rider application on {created_at.strftime("%B %d, %Y")}. You cannot apply for seller while you have a pending rider application. Please wait for admin review or withdraw your rider application.',
                        'status': 'pending',
                        'application_type': 'rider',
                        'application_date': created_at.isoformat()
                    }), 400
            elif status == 'approved':
                if app_type == 'seller':
                    return jsonify({
                        'error': 'Your seller application has already been approved.',
                        'details': 'You are already a registered seller. No need to apply again.',
                        'status': 'approved',
                        'application_type': 'seller',
                        'application_date': created_at.isoformat()
                    }), 400
                else:  # app_type == 'rider'
                    return jsonify({
                        'error': 'You are already a registered rider.',
                        'details': 'Your rider application was approved. You cannot apply to become a seller while you are an active rider.',
                        'status': 'approved',
                        'application_type': 'rider',
                        'application_date': created_at.isoformat()
                    }), 400

        # Capture fields from request
        experience_data = {
            'business_type': data.get('business_type', ''),
            'business_phone': data.get('business_phone', ''),
            'business_email': data.get('business_email', ''),
            'street_address': data.get('street_address', ''),
            'city': data.get('city', ''),
            'state': data.get('state', ''),
            'zip_code': data.get('zip_code', ''),
            'categories': data.get('categories', []) if isinstance(data.get('categories'), list) else data.get('categories', ''),
            'description': data.get('business_description', ''),
            'website': data.get('website', ''),
            'years_in_business': data.get('years_in_business', '')
        }

        # If multipart, accept uploaded files and store URLs in experience_data
        if request.content_type and 'multipart/form-data' in request.content_type.lower():
            from werkzeug.utils import secure_filename
            import time

            def allowed_file(fn):
                return '.' in fn and fn.rsplit('.', 1)[1].lower() in {'pdf','jpg','jpeg','png'}

            base_dir = os.path.join(app.static_folder, 'uploads', 'applications', 'seller', str(current_user['id']))
            os.makedirs(base_dir, exist_ok=True)

            id_urls = []
            for f in request.files.getlist('id_documents[]'):
                if f and f.filename and allowed_file(f.filename):
                    ts = time.strftime('%Y%m%d_%H%M%S')
                    filename = secure_filename(f"id_{ts}_{f.filename}")
                    path = os.path.join(base_dir, filename)
                    f.save(path)
                    id_urls.append(f"/static/uploads/applications/seller/{current_user['id']}/{filename}")
            biz_urls = []
            for f in request.files.getlist('business_documents[]'):
                if f and f.filename and allowed_file(f.filename):
                    ts = time.strftime('%Y%m%d_%H%M%S')
                    filename = secure_filename(f"biz_{ts}_{f.filename}")
                    path = os.path.join(base_dir, filename)
                    f.save(path)
                    biz_urls.append(f"/static/uploads/applications/seller/{current_user['id']}/{filename}")

            experience_data['id_documents'] = id_urls
            experience_data['business_documents'] = biz_urls

        cursor.execute("""
            INSERT INTO applications (
                user_id,
                application_type,
                status,
                business_name,
                business_registration,
                business_email,
                business_phone,
                experience
            )
            VALUES (%s, 'seller', 'pending', %s, %s, %s, %s, %s)
        """, (
            current_user['id'],
            data.get('business_name', ''),
            data.get('business_reg_number', ''),
            data.get('business_email', ''),
            data.get('business_phone', ''),
            json.dumps(experience_data)
        ))

        app_id = cursor.lastrowid

        # Ensure columns exist to store document URLs separately
        try:
            cursor.execute("SHOW COLUMNS FROM applications LIKE 'id_documents_json'")
            has_id_docs = cursor.fetchone() is not None
        except Exception:
            has_id_docs = False
        try:
            cursor.execute("SHOW COLUMNS FROM applications LIKE 'business_documents_json'")
            has_biz_docs = cursor.fetchone() is not None
        except Exception:
            has_biz_docs = False
        # Add columns if missing
        if not has_id_docs:
            try:
                cursor.execute("ALTER TABLE applications ADD COLUMN id_documents_json JSON NULL")
            except Exception:
                # Fallback to TEXT if JSON not supported
                cursor.execute("ALTER TABLE applications ADD COLUMN id_documents_json TEXT NULL")
        if not has_biz_docs:
            try:
                cursor.execute("ALTER TABLE applications ADD COLUMN business_documents_json JSON NULL")
            except Exception:
                cursor.execute("ALTER TABLE applications ADD COLUMN business_documents_json TEXT NULL")
        connection.commit()

        # Persist URLs into columns as JSON string
        try:
            id_json = json.dumps(experience_data.get('id_documents', []) if isinstance(experience_data.get('id_documents'), list) else [])
            biz_json = json.dumps(experience_data.get('business_documents', []) if isinstance(experience_data.get('business_documents'), list) else [])
            cursor.execute(
                "UPDATE applications SET id_documents_json=%s, business_documents_json=%s WHERE id=%s",
                (id_json, biz_json, app_id)
            )
        except Exception:
            pass

        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({
            'success': True, 
            'message': 'Seller application submitted successfully. You will be notified once it is reviewed.'
        })
        
    except Exception as e:
        cursor.close()
        connection.close()
        print(f"Error submitting seller application: {e}")
        return jsonify({'error': 'An error occurred while submitting your application. Please try again.'}), 500

# API endpoint to check application status for both seller and rider
@app.route('/api/applications/<application_type>/status', methods=['GET'])
@token_required
def check_application_status(current_user, application_type):
    """Check if user has an existing application of the specified type"""
    if application_type not in ['seller', 'rider']:
        return jsonify({'error': 'Invalid application type'}), 400
        
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Check for any existing applications (including rejected ones for full transparency)
        # ENHANCED: First check for ANY pending/approved application of ANY type
        cursor.execute("""
            SELECT id, status, created_at, updated_at, application_type 
            FROM applications 
            WHERE user_id = %s AND status IN ('pending', 'approved')
            ORDER BY created_at DESC
            LIMIT 1
        """, (current_user['id'],))
        
        any_pending_approved = cursor.fetchone()
        
        # If there's any pending/approved application, user cannot apply
        if any_pending_approved:
            existing_type = any_pending_approved['application_type']
            status = any_pending_approved['status']
            
            if existing_type == application_type:
                # Same type restriction
                if status == 'pending':
                    message = f'Your {application_type} application is currently under review.'
                else:  # approved
                    message = f'Your {application_type} application has been approved. You are now a registered {application_type}.'
            else:
                # Cross-type restriction
                if status == 'pending':
                    message = f'You have a pending {existing_type} application that must be reviewed first. You cannot apply for {application_type} while you have a pending {existing_type} application.'
                else:  # approved
                    message = f'You are already a registered {existing_type}. You cannot apply to become a {application_type} while you are an active {existing_type}.'
            
            return jsonify({
                'success': True,
                'can_apply': False,
                'status': status,
                'existing_application_type': existing_type,
                'requested_application_type': application_type,
                'application_id': any_pending_approved['id'],
                'submitted_date': any_pending_approved['created_at'].isoformat() if any_pending_approved['created_at'] else None,
                'updated_date': any_pending_approved['updated_at'].isoformat() if any_pending_approved['updated_at'] else None,
                'message': message
            })
        
        # Check if there's a rejected application of the requested type
        cursor.execute("""
            SELECT id, status, created_at, updated_at, application_type 
            FROM applications 
            WHERE user_id = %s AND application_type = %s AND status = 'rejected'
            ORDER BY created_at DESC
            LIMIT 1
        """, (current_user['id'], application_type))
        
        rejected_app = cursor.fetchone()
        
        if rejected_app:
            return jsonify({
                'success': True,
                'can_apply': True,
                'status': 'rejected',
                'application_id': rejected_app['id'],
                'submitted_date': rejected_app['created_at'].isoformat() if rejected_app['created_at'] else None,
                'updated_date': rejected_app['updated_at'].isoformat() if rejected_app['updated_at'] else None,
                'message': f'Your previous {application_type} application was rejected. You can submit a new application.'
            })
        
        # No applications found
        return jsonify({
            'success': True,
            'can_apply': True,
            'status': 'none',
            'message': f'No {application_type} application found. You can submit a new application.'
        })
        
    except Exception as e:
        print(f"Error checking application status: {str(e)}")
        return jsonify({'error': 'Failed to check application status'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/applications/rider', methods=['POST'])
@token_required
def submit_rider_application(current_user):
    # FIXED: Allow any user to apply to become a rider, regardless of current role

    # Accept both JSON and multipart form submissions
    if request.content_type and 'multipart/form-data' in request.content_type.lower():
        data = request.form.to_dict(flat=True)
    else:
        data = request.get_json(silent=True) or {}

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = connection.cursor()

    try:
        # Check if application already exists for this user (prevent duplicates)
        # ENHANCED: Check for ANY pending application (seller OR rider)
        cursor.execute("""
            SELECT id, status, created_at, application_type FROM applications 
            WHERE user_id = %s AND status IN ('pending', 'approved')
            ORDER BY created_at DESC
            LIMIT 1
        """, (current_user['id'],))
        existing_app = cursor.fetchone()

        if existing_app:
            cursor.close()
            connection.close()
            status = existing_app[1]  # status is at index 1
            created_at = existing_app[2]  # created_at is at index 2
            app_type = existing_app[3]  # application_type is at index 3

            if status == 'pending':
                if app_type == 'rider':
                    return jsonify({
                        'error': 'You have already submitted a rider application that is currently pending review.',
                        'details': f'Application submitted on {created_at.strftime("%B %d, %Y")}. Please wait for admin review before submitting another application.',
                        'status': 'pending',
                        'application_type': 'rider',
                        'application_date': created_at.isoformat()
                    }), 400
                else:  # app_type == 'seller'
                    return jsonify({
                        'error': 'You have a pending seller application that must be reviewed first.',
                        'details': f'You submitted a seller application on {created_at.strftime("%B %d, %Y")}. You cannot apply for rider while you have a pending seller application. Please wait for admin review or withdraw your seller application.',
                        'status': 'pending',
                        'application_type': 'seller',
                        'application_date': created_at.isoformat()
                    }), 400
            elif status == 'approved':
                if app_type == 'rider':
                    return jsonify({
                        'error': 'Your rider application has already been approved.',
                        'details': 'You are already a registered rider. No need to apply again.',
                        'status': 'approved',
                        'application_type': 'rider',
                        'application_date': created_at.isoformat()
                    }), 400
                else:  # app_type == 'seller'
                    return jsonify({
                        'error': 'You are already a registered seller.',
                        'details': 'Your seller application was approved. You cannot apply to become a rider while you are an active seller.',
                        'status': 'approved',
                        'application_type': 'seller',
                        'application_date': created_at.isoformat()
                    }), 400

        # Capture fields
        experience_data = {
            'full_name': data.get('full_name'),
            'email': data.get('email'),
            'phone': data.get('phone'),
            'license_expiry': data.get('license_expiry'),
            'vehicle_make_model': data.get('vehicle_make_model'),
            'vehicle_plate_number': data.get('vehicle_plate_number'),
            'experience_description': data.get('experience_description'),
            'availability': data.get('availability'),
            'base_location': data.get('base_location', ''),
            'coverage_area': data.get('coverage_area', '')
        }

        # If multipart, handle file uploads (license and OR/CR)
        if request.content_type and 'multipart/form-data' in request.content_type.lower():
            from werkzeug.utils import secure_filename
            import time

            def allowed_file(fn):
                return '.' in fn and fn.rsplit('.', 1)[1].lower() in {'pdf','jpg','jpeg','png'}

            base_dir = os.path.join(app.static_folder, 'uploads', 'applications', 'rider', str(current_user['id']))
            os.makedirs(base_dir, exist_ok=True)

            lic_url = None
            lic = request.files.get('drivers_license')
            if lic and lic.filename and allowed_file(lic.filename):
                ts = time.strftime('%Y%m%d_%H%M%S')
                filename = secure_filename(f"license_{ts}_{lic.filename}")
                path = os.path.join(base_dir, filename)
                lic.save(path)
                lic_url = f"/static/uploads/applications/rider/{current_user['id']}/{filename}"

            orcr_urls = []
            for f in request.files.getlist('orcr_documents[]'):
                if f and f.filename and allowed_file(f.filename):
                    ts = time.strftime('%Y%m%d_%H%M%S')
                    filename = secure_filename(f"orcr_{ts}_{f.filename}")
                    path = os.path.join(base_dir, filename)
                    f.save(path)
                    orcr_urls.append(f"/static/uploads/applications/rider/{current_user['id']}/{filename}")

            experience_data['drivers_license_url'] = lic_url
            experience_data['orcr_documents'] = orcr_urls

        cursor.execute("""
            INSERT INTO applications (user_id, application_type, vehicle_type, 
                                    license_number, experience, status)
            VALUES (%s, 'rider', %s, %s, %s, 'pending')
        """, (
            current_user['id'],
            data.get('vehicle_type'),
            data.get('license_number'),
            json.dumps(experience_data)
        ))
        
        app_id = cursor.lastrowid

        # Ensure columns for file URLs
        try:
            cursor.execute("SHOW COLUMNS FROM applications LIKE 'drivers_license_url'")
            has_lic = cursor.fetchone() is not None
        except Exception:
            has_lic = False
        try:
            cursor.execute("SHOW COLUMNS FROM applications LIKE 'orcr_documents_json'")
            has_orcr = cursor.fetchone() is not None
        except Exception:
            has_orcr = False
        if not has_lic:
            cursor.execute("ALTER TABLE applications ADD COLUMN drivers_license_url TEXT NULL")
        if not has_orcr:
            try:
                cursor.execute("ALTER TABLE applications ADD COLUMN orcr_documents_json JSON NULL")
            except Exception:
                cursor.execute("ALTER TABLE applications ADD COLUMN orcr_documents_json TEXT NULL")
        connection.commit()

        # Update row with URLs
        try:
            lic_url = experience_data.get('drivers_license_url')
            orcr_json = json.dumps(experience_data.get('orcr_documents', []) if isinstance(experience_data.get('orcr_documents'), list) else [])
            cursor.execute(
                "UPDATE applications SET drivers_license_url=%s, orcr_documents_json=%s WHERE id=%s",
                (lic_url, orcr_json, app_id)
            )
        except Exception:
            pass

        connection.commit()
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True, 
            'message': 'Rider application submitted successfully. You will be notified once it is reviewed.'
        })
        
    except Exception as e:
        cursor.close()
        connection.close()
        print(f"Error submitting rider application: {e}")
        return jsonify({'error': 'An error occurred while submitting your application. Please try again.'}), 500

@app.route('/api/migrate/remove-image-columns', methods=['GET', 'POST'])
def remove_image_columns():
    """Migration endpoint to remove image_url columns from products and product_size_stock tables"""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = connection.cursor()
        
        # Check if columns exist before trying to drop them
        cursor.execute("SHOW COLUMNS FROM products LIKE 'image_url'")
        products_has_image_url = cursor.fetchone() is not None
        
        cursor.execute("SHOW COLUMNS FROM product_size_stock LIKE 'image_url'")
        pss_has_image_url = cursor.fetchone() is not None
        
        operations = []
        
        # Drop image_url column from products table
        if products_has_image_url:
            cursor.execute("ALTER TABLE products DROP COLUMN image_url")
            operations.append("Dropped image_url column from products table")
        
        # Drop image_url column from product_size_stock table
        if pss_has_image_url:
            cursor.execute("ALTER TABLE product_size_stock DROP COLUMN image_url")
            operations.append("Dropped image_url column from product_size_stock table")
        
        connection.commit()
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'message': 'Database cleanup completed successfully',
            'operations': operations,
            'note': 'All images now come from product_variant_images table only'
        })
        
    except Exception as e:
        print(f"Error removing image columns: {str(e)}")
        return jsonify({'error': f'Failed to remove image columns: {str(e)}'}), 500

@app.route('/api/fix/product-images', methods=['GET', 'POST'])
def get_products():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    per_page = max(1, min(per_page, 100))
    # Support single or multiple categories
    category_single = request.args.get('category')
    category_list_bracket = request.args.getlist('category[]') or []
    category_list_plain = request.args.getlist('category') or []
    # If multiple plain category params were provided, treat as multi; else use single
    categories = category_list_bracket if len(category_list_bracket) > 0 else (category_list_plain if len(category_list_plain) > 1 else [])

    search = request.args.get('search')
    sort_by = request.args.get('sort_by', 'created_at')
    seller_id = request.args.get('seller') or request.args.get('seller_id')

    # Facet filters
    price_min = request.args.get('price_min', type=float)
    price_max = request.args.get('price_max', type=float)
    sizes = request.args.getlist('size[]') or request.args.getlist('size') or []
    colors = request.args.getlist('color[]') or request.args.getlist('color') or []

    connection = get_db_connection()
    if not connection:
        return jsonify({'products': [], 'meta': {'total': 0}}), 500

    where = ["p.is_active = 1", "COALESCE(p.approval_status, 'approved') = 'approved'"]
    params = []

    if seller_id:
        where.append("p.seller_id = %s")
        params.append(seller_id)

    # Category filtering
    if categories:
        placeholders = ','.join(['%s'] * len(categories))
        where.append(f"p.category IN ({placeholders})")
        params.extend(categories)
    elif category_single:
        where.append("p.category = %s")
        params.append(category_single)
    
    if search:
        like = f"%{search}%"
        where.append("(p.name LIKE %s OR p.description LIKE %s)")
        params.extend([like, like])

    where_sql = " AND ".join(where)
    
    # Get total count
    count_cur = connection.cursor(dictionary=True)
    count_cur.execute(f"SELECT COUNT(DISTINCT p.id) as total FROM products p WHERE {where_sql}", params)
    count_row = count_cur.fetchone()
    total = count_row.get('total', 0) if count_row else 0
    count_cur.close()
    
    # Get products with pagination
    offset = (page - 1) * per_page
    
    # Sort mapping (use computed min_display_price when sorting by price)
    sort_mapping = {
        'relevance': 'p.created_at DESC',
        'price-low': 'min_display_price ASC',
        'price-high': 'min_display_price DESC',
        'rating': 'p.created_at DESC',  # You can add rating field later
        'newest': 'p.created_at DESC',
        'bestseller': 'p.created_at DESC',  # You can add sales count later
        'created_at': 'p.created_at DESC'
    }
    
    order_clause = sort_mapping.get(sort_by, 'p.created_at DESC')

    # Optional stock minimum filter
    stock_min = request.args.get('stock_min', type=int)
    
    select_cur = connection.cursor(dictionary=True)
    
    # Updated query to properly group products and their size/color variations
    # Build optional EXISTS filters for facets (applied at product level)
    facet_clauses = []
    facet_params = []
    if price_min is not None or price_max is not None:
        price_clause_parts = ["pss2.product_id = p.id", "pss2.stock_quantity > 0"]
        if price_min is not None:
            price_clause_parts.append("COALESCE(pss2.discount_price, pss2.price) >= %s")
            facet_params.append(price_min)
        if price_max is not None:
            price_clause_parts.append("COALESCE(pss2.discount_price, pss2.price) <= %s")
            facet_params.append(price_max)
        facet_clauses.append("EXISTS (SELECT 1 FROM product_size_stock pss2 WHERE " + " AND ".join(price_clause_parts) + ")")
    if sizes:
        placeholders = ','.join(['%s'] * len(sizes))
        facet_clauses.append(f"EXISTS (SELECT 1 FROM product_size_stock pss3 WHERE pss3.product_id = p.id AND pss3.size IN ({placeholders}) AND pss3.stock_quantity > 0)")
        facet_params.extend(sizes)
    if colors:
        placeholders = ','.join(['%s'] * len(colors))
        facet_clauses.append(f"EXISTS (SELECT 1 FROM product_size_stock pss4 WHERE pss4.product_id = p.id AND pss4.color IN ({placeholders}) AND pss4.stock_quantity > 0)")
        facet_params.extend(colors)

    facet_sql = (" AND " + " AND ".join(facet_clauses)) if facet_clauses else ""

    query = f"""
    SELECT p.*, u.name as seller_name, u.id as seller_id,
           GROUP_CONCAT(DISTINCT pss.size) as available_sizes,
           GROUP_CONCAT(DISTINCT pss.color) as available_colors,
           MIN(COALESCE(pss.discount_price, pss.price)) as min_display_price,
           MAX(COALESCE(pss.discount_price, pss.price)) as max_display_price,
           SUM(pss.stock_quantity) as total_stock
    FROM products p
    LEFT JOIN product_size_stock pss ON p.id = pss.product_id
    LEFT JOIN users u ON p.seller_id = u.id
    WHERE {where_sql}{facet_sql}
    GROUP BY p.id
    {"HAVING COALESCE(SUM(pss.stock_quantity), 0) >= %s" if stock_min is not None else ""}
    ORDER BY {order_clause}
    LIMIT %s OFFSET %s
    """
    
    exec_params = params.copy()
    # facet params go after base params (order matters with our constructed SQL)
    exec_params += facet_params
    if stock_min is not None:
        exec_params.append(stock_min)
    exec_params += [per_page, offset]

    select_cur.execute(query, exec_params)
    products_data = select_cur.fetchall() or []
    
    # Now get detailed size/color/stock information for each product
    products_with_details = []
    
    for product in products_data:
        product_id = product['id']
        
        # Get the primary image - first try products.image_url, then product_variant_images
        product_image_url = product.get('image_url')  # Default image from products table
        
        if not product_image_url:
            # Fallback to first variant image
            image_cur = connection.cursor(dictionary=True)
            image_cur.execute("""
                SELECT image_url
                FROM product_variant_images
                WHERE product_id = %s
                ORDER BY display_order ASC, id ASC
                LIMIT 1
            """, (product_id,))
            
            primary_image = image_cur.fetchone()
            image_cur.close()
            
            product_image_url = primary_image['image_url'] if primary_image else '/static/uploads/products/placeholder.svg'
        
        # Get size-specific data for this product
        size_cur = connection.cursor(dictionary=True)
        # Sort sizes: numerical sizes (shoes, including decimals) first, then clothing sizes
        size_cur.execute("""
            SELECT size, color, color_name, stock_quantity, price, discount_price
            FROM product_size_stock
            WHERE product_id = %s AND stock_quantity > 0
            ORDER BY 
                CASE 
                    WHEN size REGEXP '^[0-9]+(\\.[0-9]+)?$' THEN CAST(size AS DECIMAL(10,2))
                    WHEN size = 'XS' THEN 1000
                    WHEN size = 'S' THEN 1001
                    WHEN size = 'M' THEN 1002
                    WHEN size = 'L' THEN 1003
                    WHEN size = 'XL' THEN 1004
                    WHEN size = 'XXL' THEN 1005
                    ELSE 9999
                END
        """, (product_id,))
        
        size_data = size_cur.fetchall()
        size_cur.close()
        
        # Organize size/color stock data
        size_color_stock = {}
        total_stock = 0
        has_discount = False
        
        for item in size_data:
            size = item['size']
            color = item['color']
            color_name = item.get('color_name', color)
            stock = int(item['stock_quantity'] or 0)
            original_price = float(item['price'] or 0)  # Variant price is primary, fallback to 0
            discount_price = float(item['discount_price']) if item.get('discount_price') else None
            
            if discount_price and discount_price < original_price:
                has_discount = True
            
            if size not in size_color_stock:
                size_color_stock[size] = {}
            
            size_color_stock[size][color] = {
                'name': color_name,
                'stock': stock,
                'price': original_price,
                'discount_price': discount_price,
                'effective_price': discount_price if discount_price else original_price
            }
            total_stock += stock
        
        # Calculate discount percentage if applicable
        discount_percentage = 0
        if has_discount and product.get('min_display_price') and product.get('max_display_price'):
            # Find the best discount percentage among all variants
            best_discount = 0
            for size_variants in size_color_stock.values():
                for variant in size_variants.values():
                    if variant['discount_price'] and variant['price']:
                        variant_discount = ((variant['price'] - variant['discount_price']) / variant['price']) * 100
                        best_discount = max(best_discount, variant_discount)
            discount_percentage = round(best_discount)
        
        # Create the product object with the expected structure
        product_obj = {
            'id': product['id'],
            'name': product['name'] or 'Unknown Product',
            'description': product.get('description', ''),
            'price': float(product['min_display_price']) if product.get('min_display_price') else (min([v['price'] for s in size_color_stock.values() for v in s.values()]) if size_color_stock else 0),
            'original_price': None,  # No longer using base price as reference
            'category': product.get('category', ''),
            'image': product_image_url,
            'image_url': product_image_url,
            'total_stock': total_stock,
            'discount_percentage': discount_percentage,
            'has_discount': has_discount,
            'is_flash_sale': bool(product.get('is_flash_sale', False)),
            'sizes': list(size_color_stock.keys()) if size_color_stock else [],
            'size_color_stock': size_color_stock,
            'seller': product.get('seller_name', 'Unknown Seller'),
            'seller_name': product.get('seller_name', 'Unknown Seller'),
            'seller_id': product.get('seller_id'),
            'rating': 4.5,  # Default rating - you can add this to your database later
            'review_count': 0,  # Default review count - you can add this later
            'created_at': product['created_at'].isoformat() if product.get('created_at') else None,
            'is_active': bool(product.get('is_active', True))
        }
        
        products_with_details.append(product_obj)

    select_cur.close()
    connection.close()
    
    pages = (total + per_page - 1) // per_page if per_page else 1
    
    return jsonify({
        'products': products_with_details,
        'meta': {
            'total': total,
            'pages': pages,
            'current_page': page,
            'per_page': per_page
        }
    })


@app.route('/api/products', methods=['GET'])
def list_products():
    # Alias for frontend consumption; uses the same logic as get_products()
    return get_products()

@app.route('/api/products/autocomplete', methods=['GET'])
def autocomplete_products():
    """Fast autocomplete endpoint for product search suggestions"""
    query = request.args.get('q', '').strip()
    limit = request.args.get('limit', 10, type=int)
    limit = max(1, min(limit, 20))  # Cap at 20 suggestions
    
    if not query or len(query) < 2:
        return jsonify({'suggestions': []})
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'suggestions': []}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        suggestions = []
        executed = False
        # Prefer FULLTEXT when available (query length >= 3)
        if len(query) >= 3:
            try:
                cursor.execute("""
                    SELECT DISTINCT
                        p.id,
                        p.name,
                        p.category,
                        COALESCE(
                            (SELECT pvi.image_url 
                             FROM product_variant_images pvi 
                             WHERE pvi.product_id = p.id 
                             ORDER BY pvi.display_order ASC 
                             LIMIT 1),
                            '/static/uploads/products/placeholder.svg'
                        ) as image_url,
                        (
                            SELECT MIN(COALESCE(pss.discount_price, pss.price))
                            FROM product_size_stock pss
                            WHERE pss.product_id = p.id AND pss.stock_quantity > 0
                        ) as min_price
                    FROM products p
                    WHERE p.is_active = 1
                      AND COALESCE(p.approval_status, 'approved') = 'approved'
                      AND MATCH(p.name, p.description, p.category) AGAINST (%s IN NATURAL LANGUAGE MODE)
                    ORDER BY p.name ASC
                    LIMIT %s
                """, (query, limit))
                rows = cursor.fetchall() or []
                for r in rows:
                    suggestions.append({
                        'id': r['id'],
                        'name': r['name'],
                        'category': r.get('category', ''),
                        'image_url': r.get('image_url', '/static/uploads/products/placeholder.svg'),
                        'price': float(r['min_price']) if r.get('min_price') else None
                    })
                executed = True
            except Exception as fe:
                print(f"[AUTOCOMPLETE] FULLTEXT fallback: {fe}")
        if not executed:
            like_pattern = f"%{query}%"
            cursor.execute("""
                SELECT DISTINCT
                    p.id,
                    p.name,
                    p.category,
                    COALESCE(
                        (SELECT pvi.image_url 
                         FROM product_variant_images pvi 
                         WHERE pvi.product_id = p.id 
                         ORDER BY pvi.display_order ASC 
                         LIMIT 1),
                        '/static/uploads/products/placeholder.svg'
                    ) as image_url,
                    (
                        SELECT MIN(COALESCE(pss.discount_price, pss.price))
                        FROM product_size_stock pss
                        WHERE pss.product_id = p.id AND pss.stock_quantity > 0
                    ) as min_price
                FROM products p
                WHERE p.is_active = 1
                  AND COALESCE(p.approval_status, 'approved') = 'approved'
                  AND (p.name LIKE %s OR p.category LIKE %s OR p.description LIKE %s)
                ORDER BY 
                    CASE 
                        WHEN p.name LIKE %s THEN 1
                        WHEN p.name LIKE %s THEN 2
                        ELSE 3
                    END,
                    p.name ASC
                LIMIT %s
            """, (like_pattern, like_pattern, like_pattern, f"{query}%", f"% {query}%", limit))
            rows = cursor.fetchall() or []
            for r in rows:
                suggestions.append({
                    'id': r['id'],
                    'name': r['name'],
                    'category': r.get('category', ''),
                    'image_url': r.get('image_url', '/static/uploads/products/placeholder.svg'),
                    'price': float(r['min_price']) if r.get('min_price') else None
                })
        return jsonify({'suggestions': suggestions})
        
    except Exception as e:
        print(f"[AUTOCOMPLETE] Error: {str(e)}")
        return jsonify({'suggestions': []}), 500
    finally:
        cursor.close()
        connection.close()

# Public seller profile endpoint used by seller-shop page
@app.route('/api/sellers/<int:seller_id>', methods=['GET'])
def get_public_seller(seller_id):
    """Return public info about a seller, including simple stats."""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cur = conn.cursor(dictionary=True)
    try:
        # Basic seller row
        cur.execute(
            """
            SELECT id, name, email, role, created_at, last_login
            FROM users
            WHERE id = %s AND role = 'seller'
            """,
            (seller_id,)
        )
        seller = cur.fetchone()
        if not seller:
            return jsonify({'error': 'Seller not found'}), 404
        
        # Product count (approved & active)
        cur.execute(
            """
            SELECT COUNT(*) AS total_products
            FROM products p
            WHERE p.seller_id = %s
              AND p.is_active = 1
              AND COALESCE(p.approval_status, 'approved') = 'approved'
            """,
            (seller_id,)
        )
        prod_row = cur.fetchone() or {'total_products': 0}
        
        # Orders count attributed to this seller (distinct orders with items from this seller)
        cur.execute(
            """
            SELECT COUNT(DISTINCT o.id) AS total_orders
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            JOIN products p ON p.id = oi.product_id
            WHERE p.seller_id = %s
            """,
            (seller_id,)
        )
        ord_row = cur.fetchone() or {'total_orders': 0}
        
        data = {
            'id': seller['id'],
            'name': seller.get('name') or 'Seller',
            'email': seller.get('email'),
            'joined_date': seller.get('created_at').isoformat() if seller.get('created_at') else None,
            'last_login': seller.get('last_login').isoformat() if seller.get('last_login') else None,
            'total_products': int(prod_row.get('total_products') or 0),
            'total_orders': int(ord_row.get('total_orders') or 0),
            # Placeholder rating fields (extend later if you add reviews aggregation)
            'rating': 4.5
        }
        return jsonify({'success': True, 'seller': data})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        try:
            cur.close()
        finally:
            conn.close()

@app.route('/api/sellers/<int:seller_id>/products', methods=['GET'])
def get_public_seller_products(seller_id):
    """Fast seller product list with pagination and minimal joins."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 24, type=int)
    per_page = max(1, min(per_page, 60))
    sort = request.args.get('sort', 'newest')

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = conn.cursor(dictionary=True)
    try:
        order_map = {
            'newest': 'p.created_at DESC',
            'oldest': 'p.created_at ASC',
            'price-low': 'min_effective_price ASC',
            'price-high': 'min_effective_price DESC',
            'rating': 'p.created_at DESC',
            'popular': 'p.created_at DESC'
        }
        order_clause = order_map.get(sort, 'p.created_at DESC')

        # Total count
        cur.execute(
            """
            SELECT COUNT(DISTINCT p.id) AS total
            FROM products p
            WHERE p.seller_id = %s AND p.is_active = 1 AND COALESCE(p.approval_status,'approved')='approved'
            """,
            (seller_id,)
        )
        total = (cur.fetchone() or {}).get('total', 0)

        offset = (page - 1) * per_page
        query = f"""
            SELECT 
                p.id,
                p.name,
                p.category,
                p.is_flash_sale,
                COALESCE(
                    (SELECT image_url FROM product_variant_images pvi 
                     WHERE pvi.product_id = p.id 
                     ORDER BY pvi.display_order ASC, pvi.id ASC LIMIT 1),
                    p.image_url
                ) AS image_url,
                MIN(pss.price) AS min_price,
                MIN(COALESCE(pss.discount_price, pss.price)) AS min_effective_price,
                SUM(COALESCE(pss.stock_quantity,0)) AS total_stock
            FROM products p
            LEFT JOIN product_size_stock pss ON p.id = pss.product_id
            WHERE p.seller_id = %s AND p.is_active = 1 AND COALESCE(p.approval_status,'approved')='approved'
            GROUP BY p.id
            ORDER BY {order_clause}
            LIMIT %s OFFSET %s
        """
        cur.execute(query, (seller_id, per_page, offset))
        rows = cur.fetchall() or []

        products = []
        for r in rows:
            min_price = float(r.get('min_price') or 0)
            eff_price = float(r.get('min_effective_price') or 0)
            discount_pct = int(round(((min_price - eff_price) / min_price) * 100)) if min_price and eff_price < min_price else 0
            products.append({
                'id': r['id'],
                'name': r.get('name') or 'Product',
                'price': eff_price,
                'original_price': None,
                'category': r.get('category') or '',
                'image_url': r.get('image_url') or '/static/uploads/products/placeholder.svg',
                'image': r.get('image_url') or '/static/uploads/products/placeholder.svg',
                'rating': 4.5,
                'review_count': 0,
                'discount_percentage': discount_pct,
                'has_discount': discount_pct > 0,
                'is_flash_sale': bool(r.get('is_flash_sale', 0)),
            })

        has_more = (offset + per_page) < total
        return jsonify({
            'success': True,
            'products': products,
            'meta': {
                'total': total,
                'page': page,
                'per_page': per_page,
                'has_more': has_more
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        try:
            cur.close()
        finally:
            conn.close()

@app.route('/api/products', methods=['POST'])
@token_required
def add_product(current_user):
    print(f"[PRODUCT] Add product request from user {current_user.get('id')} (role: {current_user.get('role')})")
    
    if current_user['role'] != 'seller':
        print(f"[PRODUCT] Access denied - user role is {current_user['role']}, not seller")
        return jsonify({'error': 'Only sellers can add products'}), 403

    data = request.form
    files = request.files.getlist('variant_images[]')
    default_images = request.files.getlist('default_images[]')
    default_image_orders = request.form.getlist('default_image_orders[]')
    variant_colors = request.form.getlist('variant_colors[]')
    variant_color_names = request.form.getlist('variant_color_names[]')
    
    print(f"[PRODUCT] Parsing size-color data: {data.get('size_color_data', '{}')}")
    size_color_data = json.loads(data.get('size_color_data', '{}'))
    print(f"[PRODUCT] Parsed size-color data: {size_color_data}")
    if not size_color_data:
        print(f"[PRODUCT] No size-color data provided")
        return jsonify({'error': 'Size and color data is required'}), 400
    
    if not default_images or len(default_images) == 0:
        print(f"[PRODUCT] No default images provided")
        return jsonify({'error': 'At least one default product image is required'}), 400

    # Validate category against approved seller application
    selected_category = (data.get('category') or '').strip()
    if not selected_category:
        return jsonify({'error': 'Category is required'}), 400

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    # Determine allowed categories from approved seller application
    try:
        check_cur = connection.cursor(dictionary=True)
        check_cur.execute(
            """
            SELECT experience
            FROM applications
            WHERE user_id = %s AND application_type = 'seller' AND status = 'approved'
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (current_user['id'],)
        )
        app_row = check_cur.fetchone()
    finally:
        try:
            check_cur.close()
        except Exception:
            pass

    if not app_row:
        connection.close()
        return jsonify({'error': 'No approved seller application found. You cannot add products yet.'}), 403

    allowed_categories = []
    try:
        exp = json.loads(app_row['experience']) if isinstance(app_row.get('experience'), str) else (app_row.get('experience') or {})
    except Exception:
        exp = {}
    cats = (exp or {}).get('categories')
    if isinstance(cats, list):
        allowed_categories = [str(c).strip() for c in cats if c]
    elif isinstance(cats, str) and cats.strip():
        allowed_categories = [cats.strip()]

    # Enforce allowed category
    if allowed_categories:
        allowed_lc = [c.lower() for c in allowed_categories]
        if selected_category.lower() not in allowed_lc:
            allowed_display = allowed_categories[0] if len(allowed_categories) == 1 else ', '.join(allowed_categories)
            connection.close()
            return jsonify({'error': f'You can only add products in your approved category: {allowed_display}'}), 403

    cursor = connection.cursor()

    try:
        cursor.execute("START TRANSACTION")
        
        cursor.execute("""
            INSERT INTO products (
                name, description, category,
                total_stock, seller_id, is_active, is_flash_sale
            ) VALUES (%s, %s, %s, %s, %s, 0, %s)
        """, (
            data.get('name'),
            data.get('description'),
            selected_category,
            int(data.get('total_stock', 0)),
            current_user['id'],
            (str(data.get('is_flash_sale', '')).lower() in ['1','true','on','yes'])
        ))

        product_id = cursor.lastrowid
        
        try:
            if str(data.get('is_flash_sale', '')).lower() in ['1','true','on','yes']:
                cursor.execute("UPDATE products SET flash_sale_status='approved' WHERE id = %s", (product_id,))
        except Exception as _:
            pass

        first_default_image_url = None
        if default_images:
            for i, default_image in enumerate(default_images):
                if default_image and default_image.filename:
                    filename = secure_filename(default_image.filename)
                    unique_filename = f"{uuid.uuid4()}_{filename}"
                    filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
                    default_image.save(filepath)
                    image_url = f"/static/uploads/products/{unique_filename}"
                    
                    if i == 0:
                        first_default_image_url = image_url
                        cursor.execute("""
                            UPDATE products 
                            SET image_url = %s 
                            WHERE id = %s
                        """, (first_default_image_url, product_id))
                    
                    display_order = int(default_image_orders[i]) if i < len(default_image_orders) else i
                    cursor.execute("""
                        INSERT INTO product_variant_images (
                            product_id, color, image_url, display_order
                        ) VALUES (%s, %s, %s, %s)
                    """, (
                        product_id,
                        'default',
                        image_url,
                        display_order
                    ))

        total_stock = 0
        for size, colors in size_color_data.items():
            for color_hex, color_data in colors.items():
                cursor.execute("""
                    INSERT INTO product_size_stock (
                        product_id, size, color, color_name,
                        stock_quantity, price, discount_price
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (
                    product_id,
                    size,
                    color_hex,
                    color_data.get('name', color_hex),
                    color_data.get('stock', 0),
                    color_data.get('price', 0),
                    color_data.get('discount_price')
                ))
                
                total_stock += color_data.get('stock', 0)
        
        for i, file in enumerate(files):
            if i < len(variant_colors):
                color_hex = variant_colors[i]
                color_name = variant_color_names[i] if i < len(variant_color_names) else None
                
                filename = secure_filename(file.filename)
                unique_filename = f"{uuid.uuid4()}_{filename}"
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
                file.save(filepath)
                image_url = f"/static/uploads/products/{unique_filename}"
                
                cursor.execute("""
                    INSERT INTO product_variant_images (
                        product_id, color, image_url, display_order
                    ) VALUES (%s, %s, %s, %s)
                """, (
                    product_id,
                    color_hex,
                    image_url,
                    i
                ))

        cursor.execute("""
            UPDATE products 
            SET total_stock = %s,
                price = (
                    SELECT MIN(price) 
                    FROM product_size_stock 
                    WHERE product_id = %s
                )
            WHERE id = %s
        """, (total_stock, product_id, product_id))

        connection.commit()
        
        print(f"[PRODUCT] Successfully created product {product_id} with {total_stock} total stock for seller {current_user['id']}")
        print(f"[PRODUCT] Product details: name='{data.get('name')}', category='{selected_category}', variants={len(size_color_data)}")
        print(f"[PRODUCT] Product {product_id} is pending admin approval before it can be displayed in the market")
        
        # Ensure product is set to pending status (default should be 'pending' but make it explicit)
        try:
            cursor2 = connection.cursor()
            cursor2.execute("UPDATE products SET approval_status = 'pending', is_active = 0 WHERE id = %s", (product_id,))
            connection.commit()
            cursor2.close()
        except Exception as _:
            pass

        return jsonify({
            'success': True,
            'message': 'Product created successfully. It is pending admin approval and will be displayed in the market once approved.',
            'product_id': product_id,
            'seller_id': current_user['id'],
            'total_stock': total_stock,
            'approval_status': 'pending'
        })

    except Exception as e:
        connection.rollback()
        print(f"Error adding product: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        connection.close()

@app.route('/api/products/<int:product_id>', methods=['GET', 'PUT', 'DELETE'])
def manage_single_product(product_id):
    """Get, update, or delete a single product"""
    if request.method == 'GET':
        # GET doesn't require authentication
        return get_product_details(product_id)
    else:
        # PUT and DELETE require authentication
        # Extract token manually
        auth_header = request.headers.get('Authorization', '')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Authorization required'}), 401
        
        token = auth_header.replace('Bearer ', '')
        try:
            decoded = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            user_id = decoded.get('user_id')
            if not user_id:
                return jsonify({'error': 'Invalid token payload'}), 401
            
            # Fetch full user from database
            connection = get_db_connection()
            if not connection:
                return jsonify({'error': 'Database connection failed'}), 500
            
            cursor = connection.cursor(dictionary=True)
            cursor.execute('SELECT * FROM users WHERE id = %s', (user_id,))
            current_user = cursor.fetchone()
            cursor.close()
            connection.close()
            
            if not current_user:
                return jsonify({'error': 'User not found'}), 401
                
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        
        if request.method == 'PUT':
            return update_product_details(current_user, product_id)
        elif request.method == 'DELETE':
            return delete_product(current_user, product_id)

def get_product_details(product_id):
    """Get a single product by ID with all variant details"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        
        # Get product basic info with seller details
        cursor.execute("""
            SELECT p.*, u.name as seller_name, u.id as seller_id
            FROM products p
            LEFT JOIN users u ON p.seller_id = u.id
            WHERE p.id = %s AND p.is_active = 1
        """, (product_id,))
        
        product = cursor.fetchone()
        if not product:
            cursor.close()
            connection.close()
            return jsonify({'error': 'Product not found'}), 404
        
        # Get variant images
        cursor.execute("""
            SELECT color, size, image_url, display_order
            FROM product_variant_images
            WHERE product_id = %s
            ORDER BY display_order ASC, id ASC
        """, (product_id,))
        variant_images = cursor.fetchall()
        
        # Get size/color/stock data
        # Sort sizes: numerical sizes (shoes, including decimals) first, then clothing sizes
        cursor.execute("""
            SELECT size, color, color_name, stock_quantity, price, discount_price
            FROM product_size_stock
            WHERE product_id = %s AND stock_quantity > 0
            ORDER BY 
                CASE 
                    WHEN size REGEXP '^[0-9]+(\\.[0-9]+)?$' THEN CAST(size AS DECIMAL(10,2))
                    WHEN size = 'XS' THEN 1000
                    WHEN size = 'S' THEN 1001
                    WHEN size = 'M' THEN 1002
                    WHEN size = 'L' THEN 1003
                    WHEN size = 'XL' THEN 1004
                    WHEN size = 'XXL' THEN 1005
                    ELSE 9999
                END
        """, (product_id,))
        size_stock_data = cursor.fetchall()
        
        # Organize size/color stock data
        size_color_stock = {}
        total_stock = 0
        
        for item in size_stock_data:
            size = item['size']
            color = item['color']
            color_name = item.get('color_name', color)
            stock = int(item['stock_quantity'] or 0)
            price = float(item['price'] or 0)
            discount_price = float(item['discount_price']) if item.get('discount_price') else None
            
            if size not in size_color_stock:
                size_color_stock[size] = {}
            
            size_color_stock[size][color] = {
                'name': color_name,
                'stock': stock,
                'price': price,
                'discount_price': discount_price
            }
            total_stock += stock
        
        # Build product response
        product_data = {
            'id': product['id'],
            'name': product['name'],
            'description': product.get('description', ''),
            'category': product.get('category', ''),
            'price': float(product.get('price') or 0),
            'image_url': product.get('image_url', ''),
            'total_stock': total_stock,
            'is_flash_sale': bool(product.get('is_flash_sale', False)),
            'seller_name': product.get('seller_name', 'Unknown'),
            'seller_id': product.get('seller_id'),
            'size_color_stock': size_color_stock,
            'variant_images': variant_images,
            'created_at': product['created_at'].isoformat() if product.get('created_at') else None,
            'is_active': bool(product.get('is_active', True))
        }
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'product': product_data
        })
        
    except Exception as e:
        print(f"Error fetching product {product_id}: {str(e)}")
        if connection:
            connection.close()
        return jsonify({'error': str(e)}), 500

def update_product_details(current_user, product_id):
    """Update product details.
    Allows name, description, category, is_flash_sale, price and total_stock edits.
    Note: price and total_stock are summary fields; detailed variant edits are handled elsewhere.
    """
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        data = request.get_json() or {}
        if not isinstance(data, dict) or not data:
            return jsonify({'error': 'No data provided'}), 400
        
        cursor = connection.cursor(dictionary=True)
        
        # Verify ownership
        cursor.execute("SELECT seller_id FROM products WHERE id = %s", (product_id,))
        product = cursor.fetchone()
        
        if not product:
            return jsonify({'error': 'Product not found'}), 404
        
        if current_user.get('role') != 'admin' and product['seller_id'] != current_user['id']:
            return jsonify({'error': 'You can only modify your own products'}), 403
        
        # Build UPDATE query dynamically
        update_fields = []
        update_values = []
        
        if 'name' in data and str(data['name']).strip():
            update_fields.append('name = %s')
            update_values.append(str(data['name']).strip())
        
        if 'description' in data:
            update_fields.append('description = %s')
            update_values.append(data.get('description') or '')
        
        if 'category' in data:
            update_fields.append('category = %s')
            update_values.append(data.get('category') or '')
        
        if 'is_flash_sale' in data:
            update_fields.append('is_flash_sale = %s')
            update_values.append(1 if data.get('is_flash_sale') else 0)
        
        # Optional fields supported by UI
        if 'price' in data:
            try:
                price_val = float(data.get('price') or 0)
                update_fields.append('price = %s')
                update_values.append(price_val)
            except Exception:
                pass  # ignore invalid price
        if 'total_stock' in data:
            try:
                stock_val = int(data.get('total_stock') or 0)
                if stock_val < 0:
                    stock_val = 0
                update_fields.append('total_stock = %s')
                update_values.append(stock_val)
            except Exception:
                pass  # ignore invalid stock
        
        if not update_fields:
            return jsonify({'error': 'No valid fields to update'}), 400
        
        # Add product_id to values
        update_values.append(product_id)
        
        # Execute UPDATE
        query = f"UPDATE products SET {', '.join(update_fields)} WHERE id = %s"
        cursor.execute(query, tuple(update_values))
        connection.commit()
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'message': 'Product updated successfully',
            'product_id': product_id
        })
    
    except Exception as e:
        if connection:
            connection.rollback()
            connection.close()
        print(f"Error updating product {product_id}: {str(e)}")
        print(f"Request data: {request.get_json()}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

def delete_product(current_user, product_id):
    """Delete a product"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        
        # Verify ownership
        cursor.execute("SELECT seller_id FROM products WHERE id = %s", (product_id,))
        product = cursor.fetchone()
        
        if not product:
            return jsonify({'error': 'Product not found'}), 404
        
        if current_user.get('role') != 'admin' and product['seller_id'] != current_user['id']:
            return jsonify({'error': 'You can only delete your own products'}), 403
        
        # Soft delete by setting is_active = 0
        cursor.execute("UPDATE products SET is_active = 0 WHERE id = %s", (product_id,))
        connection.commit()
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'message': 'Product deleted successfully',
            'product_id': product_id
        })
    
    except Exception as e:
        if connection:
            connection.rollback()
            connection.close()
        print(f"Error deleting product {product_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/products/<int:product_id>/images', methods=['PUT','POST'])
@token_required
def upsert_product_images(current_user, product_id):
    """Upload/attach default and variant images to a product.
    Expects multipart FormData with keys:
      - default_images[] (files), default_image_orders[] (ints), default_primary_index (int)
      - variant_images[] (files), variant_colors[] (hex/name), variant_color_names[] (str),
        optional: variant_display_orders[] (ints), variant_sizes[] (str)
    """
    connection = get_db_connection()
    if not connection:
        return jsonify({'error':'Database connection failed'}), 500

    cur = connection.cursor(dictionary=True)
    try:
        # Verify ownership
        cur.execute("SELECT seller_id FROM products WHERE id = %s", (product_id,))
        p = cur.fetchone()
        if not p:
            return jsonify({'error':'Product not found'}), 404
        if current_user.get('role') != 'admin' and p['seller_id'] != current_user['id']:
            return jsonify({'error':'You can only modify your own products'}), 403

        default_files = request.files.getlist('default_images[]') or []
        default_orders = request.form.getlist('default_image_orders[]') or []
        default_primary_index = request.form.get('default_primary_index')

        variant_files = request.files.getlist('variant_images[]') or []
        variant_colors = request.form.getlist('variant_colors[]') or []
        variant_color_names = request.form.getlist('variant_color_names[]') or []
        variant_orders = request.form.getlist('variant_display_orders[]') or []
        variant_sizes = request.form.getlist('variant_sizes[]') or []

        inserted = {'default': [], 'variants': []}
        cur.execute("START TRANSACTION")

        # Save default images (use color='default')
        for i, f in enumerate(default_files):
            if not f or not f.filename:
                continue
            filename = secure_filename(f.filename)
            unique_filename = f"{uuid.uuid4()}_{filename}"
            path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
            f.save(path)
            url = f"/static/uploads/products/{unique_filename}"
            try:
                order = int(default_orders[i]) if i < len(default_orders) else i
            except Exception:
                order = i
            cur.execute("""
                INSERT INTO product_variant_images (product_id, color, image_url, display_order)
                VALUES (%s, %s, %s, %s)
            """, (product_id, 'default', url, order))
            inserted['default'].append({'image_url': url, 'display_order': order})
            # Optionally set primary image
            if default_primary_index is not None and str(i) == str(default_primary_index):
                cur.execute("UPDATE products SET image_url = %s WHERE id = %s", (url, product_id))

        # Save variant images
        for i, f in enumerate(variant_files):
            if not f or not f.filename:
                continue
            filename = secure_filename(f.filename)
            unique_filename = f"{uuid.uuid4()}_{filename}"
            path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
            f.save(path)
            url = f"/static/uploads/products/{unique_filename}"
            color = variant_colors[i] if i < len(variant_colors) else None
            color_name = variant_color_names[i] if i < len(variant_color_names) else None
            size = variant_sizes[i] if i < len(variant_sizes) else None
            try:
                order = int(variant_orders[i]) if i < len(variant_orders) else i
            except Exception:
                order = i
            if not color:
                # fallback tag
                color = 'default'
            cur.execute("""
                INSERT INTO product_variant_images (product_id, size, color, image_url, display_order)
                VALUES (%s, %s, %s, %s, %s)
            """, (product_id, size, color, url, order))
            inserted['variants'].append({'color': color, 'size': size, 'image_url': url, 'display_order': order, 'color_name': color_name})

        # Commit
        connection.commit()
        return jsonify({'success': True, 'inserted': inserted})
    except Exception as e:
        connection.rollback()
        print(f"[IMAGES] Error saving images for product {product_id}: {e}")
        return jsonify({'error': 'Failed to save images'}), 500
    finally:
        cur.close()
        connection.close()


@app.route('/api/products/flash-sale', methods=['GET'])
def get_flash_sale_products():
    # Simple in-memory rate limit and cache
    if not hasattr(get_flash_sale_products, 'RATE'): get_flash_sale_products.RATE = {}
    if not hasattr(get_flash_sale_products, 'CACHE'): get_flash_sale_products.CACHE = {}
    now_ts = int(time.time())
    ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    rate = get_flash_sale_products.RATE.get(ip, {'ts': now_ts, 'count': 0})
    if now_ts - rate['ts'] >= 60:
        rate = {'ts': now_ts, 'count': 0}
    rate['count'] += 1
    get_flash_sale_products.RATE[ip] = rate
    if rate['count'] > 120:
        return jsonify({'error': 'Too many requests'}), 429

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    sort_by = request.args.get('sort')  # relevance, price-low, price-high, discount-high, newest
    search_q = request.args.get('search')
    per_page = max(1, min(per_page, 100))

    # Cache key based on query
    cache_key = json.dumps({'page':page,'per_page':per_page,'sort':sort_by,'search':search_q}, sort_keys=True)
    cache_entry = get_flash_sale_products.CACHE.get(cache_key)
    if cache_entry and (now_ts - cache_entry['ts'] <= 15):
        return jsonify(cache_entry['data'])

    connection = get_db_connection()
    if not connection:
        return jsonify({'products': [], 'meta': {'total': 0}}), 500

    try:
        # Base filters including scheduling window
        where_clauses = [
            "p.is_flash_sale = 1",
            "p.is_active = 1",
            "p.flash_sale_status = 'approved'",
            "COALESCE(p.approval_status, 'approved') = 'approved'",
            "(p.flash_sale_start IS NULL OR p.flash_sale_start <= NOW())",
            "(p.flash_sale_end IS NULL OR p.flash_sale_end >= NOW())"
        ]
        params = []
        if search_q:
            where_clauses.append("(p.name LIKE %s OR p.category LIKE %s)")
            like = f"%{search_q}%"
            params.extend([like, like])
        where_sql = " AND ".join(where_clauses)

        # Count total
        count_cur = connection.cursor(dictionary=True)
        count_sql = f"SELECT COUNT(DISTINCT p.id) as total FROM products p LEFT JOIN product_size_stock pss ON p.id=pss.product_id WHERE {where_sql}"
        count_cur.execute(count_sql, params)
        count_row = count_cur.fetchone()
        total = count_row.get('total', 0) if count_row else 0
        count_cur.close()

        # Pagination
        offset = (page - 1) * per_page
        
        # Sorting
        order_sql = "p.created_at DESC"  # default newest
        if sort_by == 'price-low':
            order_sql = "min_display_price ASC"
        elif sort_by == 'price-high':
            order_sql = "min_display_price DESC"
        elif sort_by == 'discount-high':
            order_sql = "best_discount DESC"
        elif sort_by == 'newest':
            order_sql = "p.created_at DESC"

        select_cur = connection.cursor(dictionary=True)
        query = f"""
        SELECT p.*, u.name as seller_name, u.id as seller_id,
               GROUP_CONCAT(DISTINCT pss.size) as available_sizes,
               GROUP_CONCAT(DISTINCT pss.color) as available_colors,
               MIN(COALESCE(pss.discount_price, pss.price)) as min_display_price,
               MAX(COALESCE(pss.discount_price, pss.price)) as max_display_price,
               MAX(CASE WHEN pss.price IS NOT NULL AND pss.discount_price IS NOT NULL AND pss.discount_price < pss.price
                        THEN ( (pss.price - pss.discount_price) / pss.price ) ELSE 0 END) as best_discount
        FROM products p
        LEFT JOIN product_size_stock pss ON p.id = pss.product_id
        LEFT JOIN users u ON p.seller_id = u.id
        WHERE {where_sql}
        GROUP BY p.id
        ORDER BY {order_sql}
        LIMIT %s OFFSET %s
        """
        select_cur.execute(query, params + [per_page, offset])
        products_data = select_cur.fetchall() or []
        
        # Process products similar to the main get_products function
        products_with_details = []
        
        for product in products_data:
            product_id = product['id']
            
            # Get the primary image from product_variant_images table
            image_cur = connection.cursor(dictionary=True)
            image_cur.execute("""
                SELECT image_url
                FROM product_variant_images
                WHERE product_id = %s
                ORDER BY display_order ASC
                LIMIT 1
            """, (product_id,))
            
            primary_image = image_cur.fetchone()
            image_cur.close()
            
            # Use variant image as primary, fallback to placeholder if none exists
            product_image_url = primary_image['image_url'] if primary_image else '/static/uploads/products/placeholder.svg'
            
            # Get size-specific data for this product
            size_cur = connection.cursor(dictionary=True)
            # Sort sizes: numerical sizes (shoes, including decimals) first, then clothing sizes
            size_cur.execute("""
                SELECT size, color, color_name, stock_quantity, price, discount_price
                FROM product_size_stock
                WHERE product_id = %s AND stock_quantity > 0
                ORDER BY 
                    CASE 
                        WHEN size REGEXP '^[0-9]+(\\.[0-9]+)?$' THEN CAST(size AS DECIMAL(10,2))
                        WHEN size = 'XS' THEN 1000
                        WHEN size = 'S' THEN 1001
                        WHEN size = 'M' THEN 1002
                        WHEN size = 'L' THEN 1003
                        WHEN size = 'XL' THEN 1004
                        WHEN size = 'XXL' THEN 1005
                        ELSE 9999
                    END
            """, (product_id,))
            
            size_data = size_cur.fetchall()
            size_cur.close()
            
            # Organize size/color stock data
            size_color_stock = {}
            total_stock = 0
            has_discount = False
            
            for item in size_data:
                size = item['size']
                color = item['color']
                color_name = item.get('color_name', color)
                stock = int(item['stock_quantity'] or 0)
                original_price = float(item['price'] or 0)  # Variant price is primary
                discount_price = float(item['discount_price']) if item.get('discount_price') else None
                
                if discount_price and discount_price < original_price:
                    has_discount = True
                
                if size not in size_color_stock:
                    size_color_stock[size] = {}
                
                size_color_stock[size][color] = {
                    'name': color_name,
                    'stock': stock,
                    'price': original_price,
                    'discount_price': discount_price,
                    'effective_price': discount_price if discount_price else original_price
                }
                total_stock += stock
            
            # Calculate discount percentage if applicable
            discount_percentage = 0
            if has_discount:
                best_discount = 0
                for size_variants in size_color_stock.values():
                    for variant in size_variants.values():
                        if variant['discount_price'] and variant['price']:
                            variant_discount = ((variant['price'] - variant['discount_price']) / variant['price']) * 100
                            best_discount = max(best_discount, variant_discount)
                discount_percentage = round(best_discount)
            
            # Create the product object
            product_obj = {
                'id': product['id'],
                'name': product['name'] or 'Unknown Product',
                'description': product.get('description', ''),
                'price': float(product['min_display_price']) if product.get('min_display_price') else (min([v['price'] for v in size_color_stock.values() for c in v.values()]) if size_color_stock else 0),
                'original_price': None,  # No longer using base price
                'category': product.get('category', ''),
                'image': product_image_url,
                'image_url': product_image_url,
                'total_stock': total_stock,
                'discount_percentage': discount_percentage,
                'has_discount': has_discount,
                'is_flash_sale': True,  # All products in this endpoint are flash sale
                'sizes': list(size_color_stock.keys()) if size_color_stock else [],
                'size_color_stock': size_color_stock,
                'seller': product.get('seller_name', 'Unknown Seller'),
                'seller_name': product.get('seller_name', 'Unknown Seller'),
                'seller_id': product.get('seller_id'),
                'rating': 4.5,
                'review_count': 0,
                'created_at': product['created_at'].isoformat() if product.get('created_at') else None,
                'is_active': bool(product.get('is_active', True))
            }
            
            products_with_details.append(product_obj)

        select_cur.close()
        
        pages = (total + per_page - 1) // per_page if per_page else 1
        
        payload = {
            'products': products_with_details,
            'meta': {
                'total': total,
                'pages': pages,
                'current_page': page,
                'per_page': per_page,
                'flash_sale_only': True,
                'sort': sort_by or 'newest',
                'search': search_q or ''
            }
        }
        # Cache response
        get_flash_sale_products.CACHE[cache_key] = {'ts': now_ts, 'data': payload}
        return jsonify(payload)

    except Exception as e:
        print(f"Error fetching flash sale products: {str(e)}")
        return jsonify({'error': 'Failed to fetch flash sale products'}), 500
    finally:
        if connection:
            connection.close()

@app.route('/api/products/<int:product_id>/flash-sale', methods=['PATCH'])
@token_required
def toggle_flash_sale(current_user, product_id):
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT * FROM products WHERE id = %s", (product_id,))
        product = cursor.fetchone()
        
        if not product:
            return jsonify({'error': 'Product not found'}), 404
        
        if product['seller_id'] != current_user['id']:
            return jsonify({'error': 'You can only modify your own products'}), 403
        
        data = request.get_json()
        is_flash_sale = data.get('is_flash_sale', False)
        
        if is_flash_sale:
            cursor.execute("UPDATE products SET is_flash_sale = 1, flash_sale_status='approved' WHERE id = %s", (product_id,))
        else:
            cursor.execute("UPDATE products SET is_flash_sale = 0, flash_sale_status='none' WHERE id = %s", (product_id,))
        
        connection.commit()
        
        return jsonify({
            'success': True,
            'message': f'Flash sale {"enabled" if is_flash_sale else "disabled"} for product',
            'is_flash_sale': is_flash_sale
        })

    except Exception as e:
        connection.rollback()
        print(f"Error toggling flash sale: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/products/new-arrivals', methods=['GET'])
def get_new_arrivals():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    per_page = max(1, min(per_page, 100))

    connection = get_db_connection()
    if not connection:
        return jsonify({'products': [], 'meta': {'total': 0}}), 500

    try:
        # Count
        count_cur = connection.cursor(dictionary=True)
        count_cur.execute("""
            SELECT COUNT(*) as total FROM products
            WHERE is_active = 1 AND COALESCE(approval_status, 'approved') = 'approved' AND created_at >= NOW() - INTERVAL 7 DAY
        """)
        total = (count_cur.fetchone() or {}).get('total', 0)
        count_cur.close()

        offset = (page - 1) * per_page

        # Select recent products with min/max effective price
        select_cur = connection.cursor(dictionary=True)
        query = """
        SELECT p.*, u.name as seller_name, u.id as seller_id,
               MIN(COALESCE(pss.discount_price, pss.price)) as min_display_price,
               MAX(COALESCE(pss.discount_price, pss.price)) as max_display_price
        FROM products p
        LEFT JOIN product_size_stock pss ON p.id = pss.product_id
        LEFT JOIN users u ON p.seller_id = u.id
        WHERE p.is_active = 1 AND COALESCE(p.approval_status, 'approved') = 'approved' AND p.created_at >= NOW() - INTERVAL 7 DAY
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT %s OFFSET %s
        """
        select_cur.execute(query, [per_page, offset])
        products_data = select_cur.fetchall() or []

        products_with_details = []
        for product in products_data:
            product_id = product['id']

            # primary image
            image_cur = connection.cursor(dictionary=True)
            image_cur.execute("""
                SELECT image_url FROM product_variant_images
                WHERE product_id = %s
                ORDER BY display_order ASC
                LIMIT 1
            """, (product_id,))
            primary_image = image_cur.fetchone()
            image_cur.close()
            product_image_url = primary_image['image_url'] if primary_image else '/static/uploads/products/placeholder.svg'

            # size/color stock
            size_cur = connection.cursor(dictionary=True)
            # Sort sizes: numerical sizes (shoes, including decimals) first, then clothing sizes
            size_cur.execute("""
                SELECT size, color, color_name, stock_quantity, price, discount_price
                FROM product_size_stock
                WHERE product_id = %s AND stock_quantity >= 0
                ORDER BY 
                    CASE 
                        WHEN size REGEXP '^[0-9]+(\\.[0-9]+)?$' THEN CAST(size AS DECIMAL(10,2))
                        WHEN size = 'XS' THEN 1000
                        WHEN size = 'S' THEN 1001
                        WHEN size = 'M' THEN 1002
                        WHEN size = 'L' THEN 1003
                        WHEN size = 'XL' THEN 1004
                        WHEN size = 'XXL' THEN 1005
                        ELSE 9999
                    END
            """, (product_id,))
            size_data = size_cur.fetchall()
            size_cur.close()

            size_color_stock = {}
            total_stock = 0
            for item in size_data:
                size = item['size']
                color = item['color']
                color_name = item.get('color_name', color)
                stock = int(item['stock_quantity'] or 0)
                price = float(item['price'] or 0)
                discount_price = float(item['discount_price']) if item.get('discount_price') else None
                if size not in size_color_stock:
                    size_color_stock[size] = {}
                size_color_stock[size][color] = {
                    'name': color_name,
                    'stock': stock,
                    'price': price,
                    'discount_price': discount_price,
                    'effective_price': discount_price if (discount_price and discount_price > 0) else price
                }
                total_stock += stock

            products_with_details.append({
                'id': product['id'],
                'name': product['name'] or 'Unknown Product',
                'description': product.get('description', ''),
                'price': float(product['min_display_price']) if product.get('min_display_price') else 0,
                'category': product.get('category', ''),
                'image': product_image_url,
                'image_url': product_image_url,
                'total_stock': total_stock,
                'sizes': list(size_color_stock.keys()) if size_color_stock else [],
                'size_color_stock': size_color_stock,
                'seller': product.get('seller_name', 'Unknown Seller'),
                'seller_name': product.get('seller_name', 'Unknown Seller'),
                'seller_id': product.get('seller_id'),
                'created_at': product['created_at'].isoformat() if product.get('created_at') else None,
                'is_active': bool(product.get('is_active', True))
            })

        select_cur.close()
        pages = (total + per_page - 1) // per_page if per_page else 1
        return jsonify({ 'products': products_with_details, 'meta': { 'total': total, 'pages': pages, 'current_page': page, 'per_page': per_page } })
    except Exception as e:
        print(f"Error fetching new arrivals: {str(e)}")
        return jsonify({'error': 'Failed to fetch new arrivals'}), 500
    finally:
        if connection:
            connection.close()

@app.route('/api/cart', methods=['GET', 'POST'])
@token_required
def handle_cart(current_user):
    if request.method == 'GET':
        # Fetch cart items
        try:
            connection = get_db_connection()
            cursor = connection.cursor(dictionary=True)
            
            cursor.execute("""
                SELECT 
                    c.*,
                    p.name,
                    p.seller_id,
                    pss.color_name,
                    pss.stock_quantity,
                    u.name as seller_name
                FROM cart c
                JOIN products p ON c.product_id = p.id
                JOIN product_size_stock pss ON p.id = pss.product_id 
                    AND c.size = pss.size 
                    AND c.color = pss.color
                JOIN users u ON p.seller_id = u.id
                WHERE c.user_id = %s
            """, (current_user['id'],))
            
            items = cursor.fetchall()
            
            formatted_items = []
            for item in items:
                # Check if user is the seller of this product
                is_own_product = item['seller_id'] == current_user['id']
                
                # Get variant image for this specific color
                image_cursor = connection.cursor(dictionary=True)
                image_cursor.execute("""
                    SELECT image_url
                    FROM product_variant_images
                    WHERE product_id = %s AND (color = %s OR color IS NULL)
                    ORDER BY 
                        CASE WHEN color = %s THEN 0 ELSE 1 END,
                        display_order ASC
                    LIMIT 1
                """, (item['product_id'], item['color'], item['color']))
                
                cart_image = image_cursor.fetchone()
                image_cursor.close()
                
                cart_image_url = cart_image['image_url'] if cart_image else '/static/uploads/products/placeholder.svg'
                
                formatted_items.append({
                    'id': item['id'],
                    'product_id': item['product_id'],
                    'name': item['name'],
                    'quantity': item['quantity'],
                    'size': item['size'],
                    'color': item['color_name'] or item['color'],
                    'price': float(item['price']),
                    'image_url': cart_image_url,
                    'seller_name': item['seller_name'],
                    'stock_quantity': item['stock_quantity'],
                    'is_own_product': is_own_product
                })
            
            return jsonify({
                'success': True,
                'items': formatted_items,
                'count': len(items)
            })
            
        except Exception as e:
            print(f"Error fetching cart: {str(e)}")
            return jsonify({'error': 'Failed to fetch cart items'}), 500
        finally:
            if 'cursor' in locals():
                cursor.close()
            if 'connection' in locals():
                connection.close()

    elif request.method == 'POST':
        # Add to cart
        try:
            data = request.get_json()
            product_id = data.get('product_id')
            size = data.get('size')
            color = data.get('color')
            quantity = int(data.get('quantity', 1))

            if not all([product_id, size, color]):
                return jsonify({'error': 'Missing required fields (product_id, size, color)'}), 400

            connection = get_db_connection()
            cursor = connection.cursor(dictionary=True)

            # Check product and variant existence
            cursor.execute("""
                SELECT p.*, pss.stock_quantity, pss.price, pss.discount_price, pss.color_name
                FROM products p
                JOIN product_size_stock pss ON p.id = pss.product_id
                WHERE p.id = %s AND pss.size = %s AND pss.color = %s
            """, (product_id, size, color))
            
            product = cursor.fetchone()
            
            if not product:
                return jsonify({'error': 'Product variant not found'}), 404

            # Validate product active/approved
            if int(product.get('is_active', 1) or 0) == 0:
                return jsonify({'error': 'Product is inactive'}), 400
            if product.get('flash_sale_status') == 'declined':
                return jsonify({'error': 'Product is not available for sale'}), 400

            # Prevent sellers from buying their own products
            if product['seller_id'] == current_user['id']:
                return jsonify({'error': 'You cannot purchase your own product'}), 403

            if product['stock_quantity'] < quantity:
                return jsonify({'error': f'Not enough stock. Only {product["stock_quantity"]} available'}), 400

            # Check if item already in cart
            cursor.execute("""
                SELECT id, quantity FROM cart 
                WHERE user_id = %s AND product_id = %s AND size = %s AND color = %s
            """, (current_user['id'], product_id, size, color))
            
            cart_item = cursor.fetchone()

            # Determine effective price (use discount only if valid and within flash window)
            use_discount = False
            if product.get('is_flash_sale') == 1 and product.get('discount_price') and product.get('price'):
                # Check schedule window
                start = product.get('flash_sale_start')
                end = product.get('flash_sale_end')
                now_dt = datetime.now()
                try:
                    if start and isinstance(start, str):
                        start = datetime.fromisoformat(start)
                except Exception:
                    start = None
                try:
                    if end and isinstance(end, str):
                        end = datetime.fromisoformat(end)
                except Exception:
                    end = None
                if (not start or start <= now_dt) and (not end or end >= now_dt) and product['discount_price'] < product['price']:
                    use_discount = True
            effective_price = float(product['discount_price'] if use_discount else product['price'])

            if cart_item:
                # Update existing cart item
                new_quantity = cart_item['quantity'] + quantity
                if new_quantity > product['stock_quantity']:
                    return jsonify({'error': 'Not enough stock available'}), 400
                    
                cursor.execute("""
                    UPDATE cart 
                    SET quantity = %s, 
                        price = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                """, (new_quantity, effective_price, cart_item['id']))
            else:
                # Add new cart item
                cursor.execute("""
                    INSERT INTO cart (
                        user_id, product_id, quantity, size, color, 
                        price, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, (
                    current_user['id'], 
                    product_id,
                    quantity,
                    size,
                    color,
                    effective_price
                ))

            connection.commit()

            # Get updated cart count
            cursor.execute("""
                SELECT COUNT(*) as count FROM cart WHERE user_id = %s
            """, (current_user['id'],))
            
            count = cursor.fetchone()['count']

            return jsonify({
                'success': True,
                'message': 'Added to cart successfully',
                'count': count
            })

        except Exception as e:
            print(f"Error adding to cart: {str(e)}")
            return jsonify({'error': 'Failed to add item to cart'}), 500
        finally:
            if 'cursor' in locals():
                cursor.close()
            if 'connection' in locals():
                connection.close()

# Adding the rest of the file for completeness
@app.route('/api/cart/<int:product_id>', methods=['PUT', 'DELETE'])
@token_required
def manage_cart_item(current_user, product_id):
    if request.method == 'PUT':
        try:
            data = request.get_json()
            if not data:
                return jsonify({'error': 'No data provided'}), 400
                
            quantity = int(data.get('quantity', 0))
            size = data.get('size', '')

            connection = get_db_connection()
            if not connection:
                return jsonify({'error': 'Database connection failed'}), 500
            
            cursor = connection.cursor(dictionary=True)
            
            # Check if user is the seller of this product
            cursor.execute("SELECT seller_id FROM products WHERE id = %s", (product_id,))
            product_check = cursor.fetchone()
            if product_check and product_check['seller_id'] == current_user['id']:
                cursor.close()
                connection.close()
                return jsonify({'error': 'You cannot purchase your own product'}), 403
            
            if quantity <= 0:
                # Remove item if quantity is 0 or negative
                cursor.execute("""
                    DELETE FROM cart 
                    WHERE user_id = %s AND product_id = %s AND (size = %s OR (size IS NULL AND %s = ''))
                """, (current_user['id'], product_id, size, size))
            else:
                # Check stock availability (size-aware)
                if size:
                    cursor.execute("""
                        SELECT pss.stock_quantity
                        FROM product_size_stock pss
                        JOIN products p ON pss.product_id = p.id
                        WHERE p.id = %s AND pss.size = %s AND p.is_active = 1
                    """, (product_id, size))
                    row = cursor.fetchone()
                    if not row:
                        cursor.close()
                        connection.close()
                        return jsonify({'error': 'Product/size not found or unavailable'}), 404
                    size_stock = int(row.get('stock_quantity') or 0)
                    if quantity > size_stock:
                        cursor.close()
                        connection.close()
                        return jsonify({'error': 'Not enough stock available'}), 400
                else:
                    cursor.execute("""
                        SELECT total_stock FROM products 
                        WHERE id = %s AND is_active = 1
                    """, (product_id,))
                    product = cursor.fetchone()
                    
                    if not product:
                        cursor.close()
                        connection.close()
                        return jsonify({'error': 'Product not found or unavailable'}), 404
                    if quantity > (product.get('total_stock') or 0):
                        cursor.close()
                        connection.close()
                        return jsonify({'error': 'Not enough stock available'}), 400
                
                # Update quantity
                cursor.execute("""
                    UPDATE cart 
                    SET quantity = %s, updated_at = NOW() 
                    WHERE user_id = %s AND product_id = %s AND (size = %s OR (size IS NULL AND %s = ''))
                """, (quantity, current_user['id'], product_id, size, size))
            
            connection.commit()
            
            # Get updated cart count
            cursor.execute("""
                SELECT SUM(quantity) as total_count 
                FROM cart 
                WHERE user_id = %s
            """, (current_user['id'],))
            count_result = cursor.fetchone()
            total_count = count_result['total_count'] if count_result else 0
            
            cursor.close()
            connection.close()
            
            return jsonify({
                'success': True, 
                'message': 'Cart updated successfully',
                'count': int(total_count) if total_count else 0
            })
            
        except ValueError:
            return jsonify({'error': 'Invalid quantity value'}), 400
        except Exception as e:
            print(f"Error updating cart: {str(e)}")
            return jsonify({'error': 'Failed to update cart'}), 500
    
    # DELETE method  
    if request.method == 'DELETE':
        try:
            data = request.get_json() or {}
            size = data.get('size', '')

            connection = get_db_connection()
            if not connection:
                return jsonify({'error': 'Database connection failed'}), 500

            cursor = connection.cursor(dictionary=True)

            # Check if item exists in cart
            cursor.execute("""
                SELECT id FROM cart 
                WHERE user_id = %s AND product_id = %s AND (size = %s OR (size IS NULL AND %s = ''))
            """, (current_user['id'], product_id, size, size))
            if not cursor.fetchone():
                cursor.close()
                connection.close()
                return jsonify({'error': 'Item not found in cart'}), 404

            # Remove item
            cursor.execute("""
                DELETE FROM cart 
                WHERE user_id = %s AND product_id = %s AND (size = %s OR (size IS NULL AND %s = ''))
            """, (current_user['id'], product_id, size, size))
            connection.commit()

            # Get updated cart items with images
            cursor.execute("""
                SELECT c.*, p.name, p.price, p.total_stock > 0 as in_stock,
                       u.name as seller_name
                FROM cart c
                JOIN products p ON c.product_id = p.id
                JOIN users u ON p.seller_id = u.id
                WHERE c.user_id = %s
            """, (current_user['id'],))
            cart_items = cursor.fetchall()

            # Get images from variant table for each cart item (before closing connection)
            for item in cart_items:
                # Get variant image for this specific product and color
                image_cursor = connection.cursor(dictionary=True)
                image_cursor.execute("""
                    SELECT image_url
                    FROM product_variant_images
                    WHERE product_id = %s
                    ORDER BY display_order ASC
                    LIMIT 1
                """, (item['product_id'],))
                
                item_image = image_cursor.fetchone()
                image_cursor.close()
                
                item_image_url = item_image['image_url'] if item_image else '/static/uploads/products/placeholder.svg'
                item['image_url'] = item_image_url
            
            formatted_items = []
            total_count = 0
            for item in cart_items:
                cart_item_id = f"{item['product_id']}-{item.get('size', '')}" if item.get('size') else str(item['product_id'])
                formatted_items.append({
                    'id': str(item['product_id']),
                    'cartItemId': cart_item_id,
                    'name': item['name'],
                    'price': float(item['price']),
                    'image_url': item['image_url'],
                    'seller': item['seller_name'] or '',
                    'quantity': int(item['quantity']),
                    'selectedSize': item.get('size', ''),
                    'in_stock': bool(item['in_stock'])
                })
                total_count += int(item['quantity'])

            cursor.close()
            connection.close()

            return jsonify({
                'success': True,
                'message': 'Item removed from cart successfully',
                'items': formatted_items,
                'count': total_count,
                'total_items': len(formatted_items)
            })

        except Exception as e:
            print(f"Error removing from cart: {str(e)}")
            return jsonify({'error': 'Failed to remove item from cart'}), 500

@app.route('/api/cart/clear', methods=['DELETE'])
@token_required
def clear_cart(current_user):
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = connection.cursor()
        cursor.execute("DELETE FROM cart WHERE user_id = %s", (current_user['id'],))
        connection.commit()
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True, 
            'message': 'Cart cleared successfully',
            'count': 0
        })
        
    except Exception as e:
        print(f"Error clearing cart: {str(e)}")
        return jsonify({'error': 'Failed to clear cart'}), 500

# ============= WISHLIST ENDPOINTS =============

@app.route('/api/wishlist', methods=['GET'])
@token_required
def get_wishlist(current_user):
    """Get user's wishlist items"""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = connection.cursor(dictionary=True)
        
        # Get wishlist items with product details
        cursor.execute("""
            SELECT 
                w.id as wishlist_id,
                w.product_id,
                w.created_at,
                p.name,
                p.description,
                p.price,
                p.original_price,
                p.discount_percentage,
                p.category,
                p.total_stock,
                p.is_active,
                p.image_url,
                u.name as seller_name,
                u.id as seller_id
            FROM wishlist w
            JOIN products p ON w.product_id = p.id
            JOIN users u ON p.seller_id = u.id
            WHERE w.user_id = %s
            ORDER BY w.created_at DESC
        """, (current_user['id'],))
        
        wishlist_items = cursor.fetchall()
        
        # Get variant images for each product
        for item in wishlist_items:
            cursor.execute("""
                SELECT image_url
                FROM product_variant_images
                WHERE product_id = %s
                ORDER BY display_order ASC
                LIMIT 1
            """, (item['product_id'],))
            
            variant_image = cursor.fetchone()
            if variant_image:
                item['image_url'] = variant_image['image_url']
            elif not item['image_url']:
                item['image_url'] = '/static/uploads/products/placeholder.svg'
        
        cursor.close()
        connection.close()
        
        # Format response
        formatted_items = []
        for item in wishlist_items:
            formatted_items.append({
                'wishlist_id': item['wishlist_id'],
                'product_id': item['product_id'],
                'name': item['name'],
                'description': item['description'],
                'price': float(item['price']) if item['price'] else 0,
                'original_price': float(item['original_price']) if item['original_price'] else None,
                'discount_percentage': float(item['discount_percentage']) if item['discount_percentage'] else 0,
                'category': item['category'],
                'in_stock': item['total_stock'] > 0,
                'is_active': bool(item['is_active']),
                'image_url': item['image_url'],
                'seller_name': item['seller_name'],
                'seller_id': item['seller_id'],
                'added_at': item['created_at'].isoformat() if item['created_at'] else None
            })
        
        return jsonify({
            'success': True,
            'items': formatted_items,
            'count': len(formatted_items)
        })
        
    except Exception as e:
        print(f"Error getting wishlist: {str(e)}")
        return jsonify({'error': 'Failed to get wishlist'}), 500

@app.route('/api/wishlist/<int:product_id>', methods=['POST'])
@token_required
def add_to_wishlist(current_user, product_id):
    """Add product to wishlist"""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = connection.cursor(dictionary=True)
        
        # Check if product exists
        cursor.execute("SELECT id, seller_id FROM products WHERE id = %s", (product_id,))
        product = cursor.fetchone()
        
        if not product:
            cursor.close()
            connection.close()
            return jsonify({'error': 'Product not found'}), 404
        
        # Prevent adding own products to wishlist
        if product['seller_id'] == current_user['id']:
            cursor.close()
            connection.close()
            return jsonify({'error': 'You cannot add your own products to wishlist'}), 400
        
        # Check if already in wishlist
        cursor.execute("""
            SELECT id FROM wishlist 
            WHERE user_id = %s AND product_id = %s
        """, (current_user['id'], product_id))
        
        existing = cursor.fetchone()
        
        if existing:
            cursor.close()
            connection.close()
            return jsonify({
                'success': True,
                'message': 'Product already in wishlist',
                'in_wishlist': True
            })
        
        # Add to wishlist
        cursor.execute("""
            INSERT INTO wishlist (user_id, product_id)
            VALUES (%s, %s)
        """, (current_user['id'], product_id))
        
        connection.commit()
        
        # Get updated wishlist count
        cursor.execute("""
            SELECT COUNT(*) as count FROM wishlist WHERE user_id = %s
        """, (current_user['id'],))
        
        count_result = cursor.fetchone()
        wishlist_count = count_result['count'] if count_result else 0
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'message': 'Added to wishlist',
            'in_wishlist': True,
            'count': wishlist_count
        })
        
    except Exception as e:
        print(f"Error adding to wishlist: {str(e)}")
        return jsonify({'error': 'Failed to add to wishlist'}), 500

@app.route('/api/wishlist/<int:product_id>', methods=['DELETE'])
@token_required
def remove_from_wishlist(current_user, product_id):
    """Remove product from wishlist"""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = connection.cursor(dictionary=True)
        
        # Remove from wishlist
        cursor.execute("""
            DELETE FROM wishlist 
            WHERE user_id = %s AND product_id = %s
        """, (current_user['id'], product_id))
        
        connection.commit()
        
        # Get updated wishlist count
        cursor.execute("""
            SELECT COUNT(*) as count FROM wishlist WHERE user_id = %s
        """, (current_user['id'],))
        
        count_result = cursor.fetchone()
        wishlist_count = count_result['count'] if count_result else 0
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'message': 'Removed from wishlist',
            'in_wishlist': False,
            'count': wishlist_count
        })
        
    except Exception as e:
        print(f"Error removing from wishlist: {str(e)}")
        return jsonify({'error': 'Failed to remove from wishlist'}), 500

@app.route('/api/wishlist/check/<int:product_id>', methods=['GET'])
@token_required
def check_wishlist(current_user, product_id):
    """Check if product is in user's wishlist"""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = connection.cursor(dictionary=True)
        
        cursor.execute("""
            SELECT id FROM wishlist 
            WHERE user_id = %s AND product_id = %s
        """, (current_user['id'], product_id))
        
        exists = cursor.fetchone()
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'in_wishlist': exists is not None
        })
        
    except Exception as e:
        print(f"Error checking wishlist: {str(e)}")
        return jsonify({'error': 'Failed to check wishlist'}), 500

# Stock Alert Endpoints for Back-in-Stock Notifications
@app.route('/api/stock-alerts', methods=['POST'])
@token_required
def subscribe_stock_alert(current_user):
    """Subscribe to stock alert for a product variant"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        product_id = data.get('product_id')
        size = data.get('size')
        color = data.get('color')
        
        if not product_id:
            return jsonify({'error': 'Product ID is required'}), 400
        
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = connection.cursor(dictionary=True)
        
        # Check if product exists and user doesn't own it
        cursor.execute("""
            SELECT seller_id, name FROM products WHERE id = %s AND is_active = 1
        """, (product_id,))
        
        product = cursor.fetchone()
        if not product:
            return jsonify({'error': 'Product not found or inactive'}), 404
        
        if product['seller_id'] == current_user['id']:
            return jsonify({'error': 'Cannot set alerts for your own products'}), 400
        
        # Check if alert already exists
        cursor.execute("""
            SELECT id FROM stock_alerts 
            WHERE user_id = %s AND product_id = %s AND size = %s AND color = %s
        """, (current_user['id'], product_id, size, color))
        
        existing = cursor.fetchone()
        if existing:
            return jsonify({
                'success': True,
                'message': 'Alert already set for this variant',
                'alert_exists': True
            })
        
        # Insert stock alert
        cursor.execute("""
            INSERT INTO stock_alerts (user_id, product_id, size, color)
            VALUES (%s, %s, %s, %s)
        """, (current_user['id'], product_id, size, color))
        
        connection.commit()
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'message': 'Stock alert set successfully',
            'alert_exists': True
        })
        
    except Exception as e:
        print(f"Error setting stock alert: {str(e)}")
        return jsonify({'error': 'Failed to set stock alert'}), 500

@app.route('/api/stock-alerts/<int:alert_id>', methods=['DELETE'])
@token_required
def unsubscribe_stock_alert(current_user, alert_id):
    """Unsubscribe from stock alert"""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = connection.cursor(dictionary=True)
        
        # Delete alert (ensure it belongs to current user)
        cursor.execute("""
            DELETE FROM stock_alerts 
            WHERE id = %s AND user_id = %s
        """, (alert_id, current_user['id']))
        
        if cursor.rowcount == 0:
            return jsonify({'error': 'Alert not found or access denied'}), 404
        
        connection.commit()
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'message': 'Stock alert removed successfully',
            'alert_exists': False
        })
        
    except Exception as e:
        print(f"Error removing stock alert: {str(e)}")
        return jsonify({'error': 'Failed to remove stock alert'}), 500

@app.route('/api/stock-alerts', methods=['GET'])
@token_required
def get_stock_alerts(current_user):
    """Get user's stock alert subscriptions"""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = connection.cursor(dictionary=True)
        
        cursor.execute("""
            SELECT sa.id as alert_id, sa.product_id, sa.size, sa.color, sa.created_at,
                   p.name as product_name, p.image_url,
                   pss.stock_quantity
            FROM stock_alerts sa
            JOIN products p ON sa.product_id = p.id
            LEFT JOIN product_size_stock pss ON (
                pss.product_id = sa.product_id AND 
                pss.size = sa.size AND 
                pss.color = sa.color
            )
            WHERE sa.user_id = %s AND p.is_active = 1
            ORDER BY sa.created_at DESC
        """, (current_user['id'],))
        
        alerts = cursor.fetchall()
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'alerts': alerts,
            'count': len(alerts)
        })
        
    except Exception as e:
        print(f"Error getting stock alerts: {str(e)}")
        return jsonify({'error': 'Failed to get stock alerts'}), 500

# Price Drop Alert Endpoints
@app.route('/api/price-drop-alerts', methods=['POST'])
@token_required
def subscribe_price_drop_alert(current_user):
    """Subscribe to price drop alert for a product (optional target_price)"""
    try:
        data = request.get_json() or {}
        product_id = data.get('product_id')
        target_price = data.get('target_price')
        if not product_id:
            return jsonify({'error': 'Product ID is required'}), 400

        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        cur = conn.cursor(dictionary=True)

        # Prevent sellers from alerting on own product
        cur.execute("SELECT seller_id, name FROM products WHERE id=%s", (product_id,))
        prod = cur.fetchone()
        if not prod:
            return jsonify({'error': 'Product not found'}), 404
        if prod['seller_id'] == current_user['id']:
            return jsonify({'error': 'Cannot set alerts for your own products'}), 400

        # Check existing alert (same target)
        cur.execute(
            "SELECT id FROM price_drop_alerts WHERE user_id=%s AND product_id=%s AND ((target_price IS NULL AND %s IS NULL) OR target_price = %s)",
            (current_user['id'], product_id, target_price, target_price)
        )
        if cur.fetchone():
            return jsonify({'success': True, 'message': 'Alert already exists'})

        # Determine initial current min price
        cur.execute(
            """
            SELECT MIN(COALESCE(pss.discount_price, pss.price)) AS min_price
            FROM product_size_stock pss WHERE pss.product_id=%s AND pss.stock_quantity > 0
            """,
            (product_id,)
        )
        row = cur.fetchone()
        initial_price = float(row['min_price']) if row and row.get('min_price') is not None else None

        cur.execute(
            "INSERT INTO price_drop_alerts (user_id, product_id, initial_price, target_price) VALUES (%s,%s,%s,%s)",
            (current_user['id'], product_id, initial_price, target_price)
        )
        conn.commit()
        cur.close(); conn.close()
        return jsonify({'success': True, 'message': 'Price drop alert set', 'initial_price': initial_price})
    except Exception as e:
        print(f"Error setting price drop alert: {e}")
        return jsonify({'error': 'Failed to set price drop alert'}), 500

@app.route('/api/price-drop-alerts/<int:alert_id>', methods=['DELETE'])
@token_required
def unsubscribe_price_drop_alert(current_user, alert_id):
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        cur = conn.cursor()
        cur.execute("DELETE FROM price_drop_alerts WHERE id=%s AND user_id=%s", (alert_id, current_user['id']))
        if cur.rowcount == 0:
            return jsonify({'error': 'Alert not found or access denied'}), 404
        conn.commit(); cur.close(); conn.close()
        return jsonify({'success': True, 'message': 'Price drop alert removed'})
    except Exception as e:
        print(f"Error removing price drop alert: {e}")
        return jsonify({'error': 'Failed to remove price drop alert'}), 500

@app.route('/api/price-drop-alerts', methods=['GET'])
@token_required
def get_price_drop_alerts(current_user):
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT a.id as alert_id, a.product_id, a.initial_price, a.target_price, a.notified_at, a.created_at,
                   p.name as product_name,
                   COALESCE((SELECT pvi.image_url FROM product_variant_images pvi WHERE pvi.product_id=p.id ORDER BY pvi.display_order ASC, pvi.id ASC LIMIT 1),
                            '/static/uploads/products/placeholder.svg') AS image_url
            FROM price_drop_alerts a
            JOIN products p ON p.id = a.product_id
            WHERE a.user_id = %s AND p.is_active = 1
            ORDER BY a.created_at DESC
            """,
            (current_user['id'],)
        )
        rows = cur.fetchall() or []
        cur.close(); conn.close()
        return jsonify({'success': True, 'alerts': rows, 'count': len(rows)})
    except Exception as e:
        print(f"Error getting price drop alerts: {e}")
        return jsonify({'error': 'Failed to get price drop alerts'}), 500

@app.route('/api/price-drop-alerts/check', methods=['POST'])
@token_required
def check_price_drop_alert(current_user):
    try:
        data = request.get_json() or {}
        product_id = data.get('product_id')
        if not product_id:
            return jsonify({'error': 'Product ID is required'}), 400
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT id FROM price_drop_alerts WHERE user_id=%s AND product_id=%s AND target_price IS NULL AND notified_at IS NULL",
            (current_user['id'], product_id)
        )
        row = cur.fetchone()
        cur.close(); conn.close()
        return jsonify({'success': True, 'alert_exists': row is not None, 'alert_id': row['id'] if row else None})
    except Exception as e:
        print(f"Error checking price drop alert: {e}")
        return jsonify({'error': 'Failed to check price drop alert'}), 500


@app.route('/api/stock-alerts/check', methods=['POST'])
@token_required
def check_stock_alert(current_user):
    """Check if user has stock alert set for a product variant"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        product_id = data.get('product_id')
        size = data.get('size')
        color = data.get('color')
        
        if not product_id:
            return jsonify({'error': 'Product ID is required'}), 400
        
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = connection.cursor(dictionary=True)
        
        cursor.execute("""
            SELECT id FROM stock_alerts 
            WHERE user_id = %s AND product_id = %s AND size = %s AND color = %s
        """, (current_user['id'], product_id, size, color))
        
        alert = cursor.fetchone()
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'alert_exists': alert is not None,
            'alert_id': alert['id'] if alert else None
        })
        
    except Exception as e:
        print(f"Error checking stock alert: {str(e)}")
        return jsonify({'error': 'Failed to check stock alert'}), 500

# SEO Endpoints
@app.route('/sitemap.xml', methods=['GET'])
@app.route('/api/sitemap.xml', methods=['GET'])
def sitemap():
    """Generate dynamic sitemap.xml for SEO"""
    try:
        connection = get_db_connection()
        if not connection:
            return "<?xml version='1.0' encoding='UTF-8'?><urlset></urlset>", 500
        
        cursor = connection.cursor(dictionary=True)
        
        # Base URL - adjust this to your production domain
        base_url = request.host_url.rstrip('/')
        
        # Start XML
        xml_lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        ]
        
        # Add homepage
        xml_lines.append(f'''
  <url>
    <loc>{base_url}/</loc>
    <lastmod>{datetime.now().strftime('%Y-%m-%d')}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>''')
        
        # Add static pages
        static_pages = [
            {'path': '/templates/Public/market.html', 'changefreq': 'daily', 'priority': '0.9'},
            {'path': '/templates/Public/flash-sales.html', 'changefreq': 'daily', 'priority': '0.8'},
            {'path': '/templates/Authenticator/login.html', 'changefreq': 'monthly', 'priority': '0.5'},
            {'path': '/templates/Authenticator/register.html', 'changefreq': 'monthly', 'priority': '0.5'},
        ]
        
        for page in static_pages:
            xml_lines.append(f'''
  <url>
    <loc>{base_url}{page['path']}</loc>
    <lastmod>{datetime.now().strftime('%Y-%m-%d')}</lastmod>
    <changefreq>{page['changefreq']}</changefreq>
    <priority>{page['priority']}</priority>
  </url>''')
        
        # Add all active products
        cursor.execute("""
            SELECT id, name, created_at, updated_at
            FROM products
            WHERE is_active = 1 AND approval_status = 'approved'
            ORDER BY updated_at DESC
            LIMIT 5000
        """)
        
        products = cursor.fetchall()
        
        for product in products:
            lastmod = product['updated_at'] or product['created_at'] or datetime.now()
            if isinstance(lastmod, datetime):
                lastmod_str = lastmod.strftime('%Y-%m-%d')
            else:
                lastmod_str = datetime.now().strftime('%Y-%m-%d')
            
            xml_lines.append(f'''
  <url>
    <loc>{base_url}/templates/Public/product.html?id={product['id']}</loc>
    <lastmod>{lastmod_str}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>''')
        
        # Add categories (if you have a category listing page)
        cursor.execute("""
            SELECT DISTINCT category FROM products 
            WHERE is_active = 1 AND category IS NOT NULL
        """)
        
        categories = cursor.fetchall()
        
        for cat in categories:
            if cat['category']:
                xml_lines.append(f'''
  <url>
    <loc>{base_url}/templates/Public/market.html?category={cat['category']}</loc>
    <lastmod>{datetime.now().strftime('%Y-%m-%d')}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>''')
        
        xml_lines.append('</urlset>')
        
        cursor.close()
        connection.close()
        
        sitemap_xml = '\n'.join(xml_lines)
        
        from flask import Response
        return Response(sitemap_xml, mimetype='application/xml')
        
    except Exception as e:
        print(f"Error generating sitemap: {str(e)}")
        return "<?xml version='1.0' encoding='UTF-8'?><urlset></urlset>", 500

@app.route('/api/orders', methods=['GET', 'POST'])
@token_required
def manage_orders(current_user):
    """Get or create orders"""
    if request.method == 'POST':
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        order_number = generate_order_number()
        
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500

        cursor = connection.cursor(dictionary=True)
        
        try:
            cursor.execute("START TRANSACTION")
            
            shipping_info = data.get('shipping_info', {})

            # Resolve address from address_id if provided
            address_id = shipping_info.get('address_id') or shipping_info.get('addressId')
            if address_id:
                try:
                    addr_cur = connection.cursor(dictionary=True)
                    addr_cur.execute("""
                        SELECT label, contact_name, contact_phone, region, province, city, barangay,
                               street, postal_code
                        FROM user_addresses
                        WHERE id = %s AND user_id = %s
                    """, (address_id, current_user['id']))
                    addr = addr_cur.fetchone()
                    addr_cur.close()
                    if not addr:
                        raise ValueError('Saved address not found')

                    # Compose full address string
                    full_address = ", ".join([
                        x for x in [
                            addr.get('street'),
                            addr.get('barangay'),
                            addr.get('city'),
                            addr.get('province'),
                            addr.get('region'),
                            addr.get('postal_code'),
                            'Philippines'
                        ] if x
                    ])
                    # Override shipping_info for order fields (use contact data from saved address)
                    shipping_info['address'] = full_address
                    shipping_info['city'] = addr.get('city') or ''
                    shipping_info['postal'] = addr.get('postal_code') or ''
                    shipping_info['country'] = 'Philippines'
                    # Ensure full name comes from address contact
                    if not shipping_info.get('fullName'):
                        shipping_info['fullName'] = addr.get('contact_name') or ''
                    # Pass phone for downstream use if needed (not stored in orders schema)
                    if not shipping_info.get('phone'):
                        shipping_info['phone'] = addr.get('contact_phone') or ''
                except Exception as e:
                    print(f"[CHECKOUT] address_id resolution failed: {e}")
            
            # Get items and validate all products
            items = data.get('items', [])
            if not items:
                raise ValueError("Order must contain at least one item")
            
            # Check all products to ensure buyer is not the seller of any product
            seller_ids = set()
            for item in items:
                product_id = item.get('product_id') or item.get('id')
                if not product_id:
                    raise ValueError(f"Missing product ID for item: {item}")
                    
                cursor.execute("SELECT seller_id FROM products WHERE id = %s", (product_id,))
                product_result = cursor.fetchone()
                if not product_result:
                    raise ValueError(f"Product with ID {product_id} not found")
                
                # Prevent sellers from buying their own products
                if product_result['seller_id'] == current_user['id']:
                    raise ValueError("You cannot purchase your own product")
                    
                seller_ids.add(product_result['seller_id'])
            
            # Get the first seller_id for order assignment (in case of single seller)
            # Note: This system assumes one order = one seller. If multiple sellers, 
            # you may need to split into multiple orders
            seller_id = list(seller_ids)[0]
            
            # Calculate financial breakdown for the order
            product_subtotal = 0.0
            for item in items:
                try:
                    qty = int(item.get('quantity', 1))
                    price = float(item.get('price', 0))
                except (TypeError, ValueError):
                    raise ValueError(f"Invalid price/quantity for item: {item}")
                product_subtotal += price * qty

            # Determine delivery fee (shipping) - prefer explicit value from client, fallback to inferred/default
            raw_total = data.get('total_amount')
            try:
                raw_total = float(raw_total) if raw_total is not None else None
            except (TypeError, ValueError):
                raw_total = None

            delivery_fee = 0.0
            if data.get('shipping_fee') is not None:
                try:
                    delivery_fee = float(data.get('shipping_fee') or 0)
                except (TypeError, ValueError):
                    delivery_fee = 0.0
            elif raw_total is not None and raw_total >= product_subtotal:
                # Infer delivery fee from total - subtotal
                delivery_fee = round(raw_total - product_subtotal, 2)
            else:
                # Safe fallback that should match frontend default
                delivery_fee = 50.0

            commission_rate = 0.05
            admin_commission = round(product_subtotal * commission_rate, 2)
            seller_earnings = round(product_subtotal - admin_commission, 2)

            total_amount = round(product_subtotal + delivery_fee, 2)

            # Insert order with pending status and financial breakdown
            # NOTE: The number of %s placeholders MUST match the number of parameters passed.
            cursor.execute("""
                INSERT INTO orders (
                    order_number, buyer_id, seller_id, full_name, email,
                    address, city, postal_code, country,
                    total_amount, product_subtotal, delivery_fee, admin_commission, seller_earnings,
                    payment_method, special_notes, status
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending')
            """, (
                order_number,
                current_user['id'],
                seller_id,
                shipping_info.get('fullName', ''),
                shipping_info.get('email', ''),
                shipping_info.get('address', ''),
                shipping_info.get('city', ''),
                shipping_info.get('postal', ''),
                shipping_info.get('country', 'Philippines'),
                total_amount,
                product_subtotal,
                delivery_fee,
                admin_commission,
                seller_earnings,
                data.get('payment_method', 'GCASH'),
                (data.get('special_notes') or shipping_info.get('special_notes') or shipping_info.get('notes') or '').strip()
            ))
            
            order_id = cursor.lastrowid
            
            # Record initial order status history
            cursor.execute(
                "INSERT INTO order_status_history (order_id, status) VALUES (%s, %s)",
                (order_id, 'pending')
            )
            
            # Insert order items
            for item in data.get('items', []):
                # Ensure we have a valid product_id
                product_id = item.get('product_id') or item.get('id')
                if not product_id:
                    raise ValueError(f"Missing product ID for item: {item}")

                cursor.execute("""
                    INSERT INTO order_items (
                        order_id, product_id, product_name,
                        quantity, price, size, color
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (
                    order_id,
                    product_id,
                    item.get('name', 'Unknown Product'),
                    int(item.get('quantity', 1)),
                    float(item.get('price', 0)),
                    item.get('size', ''),
                    item.get('color', '')
                ))

                # Check current stock before deduction
                quantity = int(item.get('quantity', 1))
                size = item.get('size', '')
                color = item.get('color', '')
                
                print(f"[STOCK DEBUG] Checking stock for product {product_id}: size='{size}', color='{color}', quantity={quantity}")
                
                cursor.execute("""
                    SELECT stock_quantity FROM product_size_stock 
                    WHERE product_id = %s AND size = %s AND color = %s
                """, (product_id, size, color))
                
                stock_result = cursor.fetchone()
                print(f"[STOCK DEBUG] Stock query result: {stock_result}")
                
                # If exact match not found, try to find any available variant for this product
                if not stock_result:
                    print(f"[STOCK DEBUG] Exact variant not found, looking for any available variant...")
                    cursor.execute("""
                        SELECT size, color, color_name, stock_quantity 
                        FROM product_size_stock 
                        WHERE product_id = %s AND stock_quantity >= %s
                        ORDER BY stock_quantity DESC
                        LIMIT 1
                    """, (product_id, quantity))
                    
                    fallback_variant = cursor.fetchone()
                    if fallback_variant:
                        print(f"[STOCK DEBUG] Using fallback variant: {fallback_variant}")
                        # Update the size and color to match the available variant
                        size = fallback_variant['size']
                        color = fallback_variant['color']
                        stock_result = {'stock_quantity': fallback_variant['stock_quantity']}
                        
                        # Update the order item with the actual variant used
                        cursor.execute("""
                            UPDATE order_items 
                            SET size = %s, color = %s
                            WHERE order_id = %s AND product_id = %s
                        """, (size, color, order_id, product_id))
                
                if not stock_result or stock_result['stock_quantity'] < quantity:
                    # Additional debug: Show what variants are actually available
                    cursor.execute("""
                        SELECT size, color, color_name, stock_quantity 
                        FROM product_size_stock 
                        WHERE product_id = %s
                    """, (product_id,))
                    available_variants = cursor.fetchall()
                    print(f"[STOCK DEBUG] Available variants for product {product_id}: {available_variants}")
                    
                    raise ValueError(f"Insufficient stock for product {item.get('name', '')}. Available: {stock_result['stock_quantity'] if stock_result else 0}, Requested: {quantity}")
                
                # NOTE: Stock is NOT deducted at checkout
                # Stock will be deducted only when seller confirms the order
                print(f"[STOCK] Stock check passed for product {product_id} ({size}/{color}): {stock_result['stock_quantity']} available, {quantity} requested. Stock will be deducted when seller confirms order.")

            # Clear cart after successful order creation
            cursor.execute("DELETE FROM cart WHERE user_id = %s", (current_user['id'],))
            
            # Commit transaction
            connection.commit()
            
            # Fire-and-forget order confirmation email (do not block response)
            try:
                send_order_confirmation_email(order_id)
            except Exception as _:
                pass
            
            # Store order number in session
            session['order_number'] = order_number
            
            return jsonify({
                'success': True,
                'order_number': order_number,
                'message': 'Order created successfully',
                'total_amount': float(total_amount),
                'product_subtotal': float(product_subtotal),
                'delivery_fee': float(delivery_fee),
                'admin_commission': float(admin_commission),
                'seller_earnings': float(seller_earnings)
            })

        except Exception as e:
            connection.rollback()
            print(f"Error creating order: {str(e)}")
            return jsonify({'error': str(e)}), 500
            
        finally:
            cursor.close()
            connection.close()
    
    print(f"[DEBUG] get_orders called by user: {current_user.get('id')} role: {current_user.get('role')}")
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        if current_user['role'] == 'buyer':
            cursor.execute("""
                SELECT 
                    o.*,
                    u.name as buyer_name,
                    u.email as buyer_email,
                    u.phone as buyer_phone,
                    CONCAT(o.address, ', ', o.city, ' ', o.postal_code, ', ', o.country) as shipping_address
                FROM orders o
                LEFT JOIN users u ON o.buyer_id = u.id
                WHERE o.buyer_id = %s
                ORDER BY o.created_at DESC
            """, (current_user['id'],))
        elif current_user['role'] == 'seller':
            cursor.execute("""
                SELECT DISTINCT
                    o.*,
                    u.name as buyer_name,
                    u.email as buyer_email,
                    u.phone as buyer_phone,
                    CONCAT(o.address, ', ', o.city, ' ', o.postal_code, ', ', o.country) as shipping_address
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                LEFT JOIN users u ON o.buyer_id = u.id
                WHERE p.seller_id = %s
                ORDER BY o.created_at DESC
            """, (current_user['id'],))
        else:
            return jsonify({'error': 'Unauthorized role'}), 403

        orders = cursor.fetchall()
        print(f"[DEBUG] Found {len(orders)} orders for {current_user.get('role')}")
        
        # Get detailed items for each order with seller information
        detailed_orders = []
        for order in orders:
            # Get items (filtered by seller for seller role)
            if current_user['role'] == 'seller':
                cursor.execute("""
                    SELECT 
                        oi.*,
                        p.name as product_name,
                        COALESCE((SELECT pvi.image_url FROM product_variant_images pvi WHERE pvi.product_id = p.id ORDER BY pvi.display_order ASC, pvi.id ASC LIMIT 1), p.image_url) as image_url,
                        p.seller_id,
                        u.name as seller_name,
                        u.email as seller_email,
                        u.phone as seller_phone,
                        u.address as seller_address,
                        a.business_name,
                        a.business_registration
                    FROM order_items oi
                    JOIN products p ON oi.product_id = p.id
                    LEFT JOIN users u ON p.seller_id = u.id
                    LEFT JOIN applications a ON p.seller_id = a.user_id AND a.status = 'approved'
                    WHERE oi.order_id = %s AND p.seller_id = %s
                """, (order['id'], current_user['id']))
            else:
                cursor.execute("""
                    SELECT 
                        oi.*,
                        p.name as product_name,
                        COALESCE((SELECT pvi.image_url FROM product_variant_images pvi WHERE pvi.product_id = p.id ORDER BY pvi.display_order ASC, pvi.id ASC LIMIT 1), p.image_url) as image_url,
                        p.seller_id,
                        u.name as seller_name,
                        u.email as seller_email,
                        u.phone as seller_phone,
                        u.address as seller_address,
                        a.business_name,
                        a.business_registration
                    FROM order_items oi
                    JOIN products p ON oi.product_id = p.id
                    LEFT JOIN users u ON p.seller_id = u.id
                    LEFT JOIN applications a ON p.seller_id = a.user_id AND a.status = 'approved'
                    WHERE oi.order_id = %s
                """, (order['id'],))

            items = cursor.fetchall()

            # Format order data with seller information
            detailed_order = {
                'id': order['id'],
                'order_number': order['order_number'],
                'status': order['status'],
                'cancel_reason': order.get('cancel_reason'),
                'payment_status': order.get('payment_status', 'pending'),
                'payment_method': order.get('payment_method'),
                'total_amount': float(order['total_amount']),
                'created_at': order['created_at'].isoformat() if order.get('created_at') else None,
                'tracking_number': order.get('tracking_number'),
                'special_notes': order.get('special_notes', ''),

                'customer_name': order.get('full_name') or order.get('buyer_name'),
                'buyer': {
                    'name': order.get('buyer_name', 'N/A'),
                    'full_name': order.get('full_name') or order.get('buyer_name', 'N/A'),
                    'email': order.get('buyer_email', 'N/A'),
                    'phone': order.get('buyer_phone', 'N/A')
                },
                'shipping': {
                    'address': order.get('address', ''),
                    'city': order.get('city', ''),
                    'postal_code': order.get('postal_code', ''),
                    'country': order.get('country', 'Philippines'),
                    'full_address': order.get('shipping_address', '')
                                    },
                    'items': [{
                    'id': item['id'],
                    'product_id': item['product_id'],
                    'name': item['product_name'],
                    'quantity': item['quantity'],
                    'price': float(item['price']),
                    'subtotal': float(item['price'] * item['quantity']),
                    'image_url': item.get('image_url') or '',
                    'size': item.get('size', ''),
                    'color': item.get('color', ''),
                    'seller_name': item.get('seller_name', 'Unknown Seller'),
                    'seller_info': {
                        'business_name': item.get('business_name', 'N/A'),
                        'business_registration': item.get('business_registration', 'N/A'),
                        'address': item.get('seller_address', 'N/A'),
                        'phone': item.get('seller_phone', 'N/A'),
                        'email': item.get('seller_email', 'N/A')
                    }
                } for item in items],
                'customer_email': order.get('buyer_email'),
                'customer_phone': order.get('buyer_phone')
            }
            
            detailed_orders.append(detailed_order)

        return jsonify({
            'success': True,
            'orders': detailed_orders
        })

    except Exception as e:
        print(f"Error fetching orders: {str(e)}")
        return jsonify({'error': 'Failed to fetch orders'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/deliveries', methods=['GET'])
@token_required
def get_deliveries(current_user):
    if current_user['role'] != 'rider':
        return jsonify({'error': 'Only riders can access deliveries'}), 403
    
    status = request.args.get('status', 'all')
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    where_clauses = []
    params = []
    
    if status == 'active':
        where_clauses.append("d.status IN ('assigned', 'picked_up')")
    elif status == 'available':
        where_clauses.append("d.status = 'pending'")
    elif status != 'all':
        where_clauses.append("d.status = %s")
        params.append(status)
    
    # Show assigned deliveries and available ones
    where_clauses.append("(d.rider_id = %s OR d.rider_id IS NULL)")
    params.append(current_user['id'])
    
    where_sql = " AND ".join(where_clauses)
    
    cursor.execute(f"""
        SELECT d.*, o.order_number, u.name as customer_name
        FROM deliveries d
        JOIN orders o ON d.order_id = o.id
        LEFT JOIN users u ON o.buyer_id = u.id
        WHERE {where_sql}
        ORDER BY d.created_at DESC
    """, params)
    
    deliveries = cursor.fetchall()
    cursor.close()
    connection.close()
    
    return jsonify({
        'success': True,
        'deliveries': [{
            'id': delivery['id'],
            'order_number': delivery['order_number'],
            'status': delivery['status'],
            'delivery_address': delivery['delivery_address'],
            'delivery_fee': float(delivery['delivery_fee']),
            'estimated_time': delivery['estimated_time'],
            'distance': delivery['distance'],
            'customer_name': delivery['customer_name']
        } for delivery in deliveries]
    })


@app.route('/api/seller/analytics', methods=['GET'])
@token_required
def seller_analytics(current_user):
    """Return sales and orders metrics for the seller (week/month/year) and deltas.
    - sales: this month sales (for existing UI)
    - salesDelta: percent change vs last month
    - orders: this week count (for existing UI)
    - ordersDelta: percent change vs last week
    - salesWeek/Month/Year and ordersWeek/Month/Year
    """
    if current_user.get('role') != 'seller':
        return jsonify({'error': 'Unauthorized'}), 403

    def pct_delta(curr, prev):
        try:
            curr_v = float(curr or 0)
            prev_v = float(prev or 0)
            if prev_v == 0:
                return 0
            return int(round(((curr_v - prev_v) / prev_v) * 100))
        except Exception:
            return 0

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = conn.cursor(dictionary=True)
    try:
        seller_id = current_user['id']

        # This week (ISO week) vs last week - only count confirmed and later statuses
        cur.execute("""
            SELECT COALESCE(SUM(o.total_amount),0) AS sales, COUNT(*) AS orders
            FROM orders o
            WHERE o.seller_id = %s
              AND o.status != 'cancelled'
              AND o.status != 'pending'
              AND o.status IN ('confirmed', 'prepared', 'shipped', 'delivered')
              AND YEARWEEK(o.created_at, 1) = YEARWEEK(CURDATE(), 1)
        """, (seller_id,))
        this_week = cur.fetchone() or {'sales': 0, 'orders': 0}

        cur.execute("""
            SELECT COALESCE(SUM(o.total_amount),0) AS sales, COUNT(*) AS orders
            FROM orders o
            WHERE o.seller_id = %s
              AND o.status != 'cancelled'
              AND o.status != 'pending'
              AND o.status IN ('confirmed', 'prepared', 'shipped', 'delivered')
              AND YEARWEEK(o.created_at, 1) = YEARWEEK(DATE_SUB(CURDATE(), INTERVAL 1 WEEK), 1)
        """, (seller_id,))
        last_week = cur.fetchone() or {'sales': 0, 'orders': 0}

        # This month vs last month
        cur.execute("""
            SELECT COALESCE(SUM(o.total_amount),0) AS sales, COUNT(*) AS orders
            FROM orders o
            WHERE o.seller_id = %s
              AND o.status != 'cancelled'
              AND o.status != 'pending'
              AND o.status IN ('confirmed', 'prepared', 'shipped', 'delivered')
              AND YEAR(o.created_at) = YEAR(CURDATE())
              AND MONTH(o.created_at) = MONTH(CURDATE())
        """, (seller_id,))
        this_month = cur.fetchone() or {'sales': 0, 'orders': 0}

        cur.execute("""
            SELECT COALESCE(SUM(o.total_amount),0) AS sales, COUNT(*) AS orders
            FROM orders o
            WHERE o.seller_id = %s
              AND o.status != 'cancelled'
              AND o.status != 'pending'
              AND o.status IN ('confirmed', 'prepared', 'shipped', 'delivered')
              AND YEAR(o.created_at) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
              AND MONTH(o.created_at) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
        """, (seller_id,))
        last_month = cur.fetchone() or {'sales': 0, 'orders': 0}

        # This year vs last year
        cur.execute("""
            SELECT COALESCE(SUM(o.total_amount),0) AS sales, COUNT(*) AS orders
            FROM orders o
            WHERE o.seller_id = %s
              AND o.status != 'cancelled'
              AND o.status != 'pending'
              AND o.status IN ('confirmed', 'prepared', 'shipped', 'delivered')
              AND YEAR(o.created_at) = YEAR(CURDATE())
        """, (seller_id,))
        this_year = cur.fetchone() or {'sales': 0, 'orders': 0}

        cur.execute("""
            SELECT COALESCE(SUM(o.total_amount),0) AS sales, COUNT(*) AS orders
            FROM orders o
            WHERE o.seller_id = %s
              AND o.status != 'cancelled'
              AND o.status != 'pending'
              AND o.status IN ('confirmed', 'prepared', 'shipped', 'delivered')
              AND YEAR(o.created_at) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 YEAR))
        """, (seller_id,))
        last_year = cur.fetchone() or {'sales': 0, 'orders': 0}

        return jsonify({
            'success': True,
            # existing UI expectations
            'sales': float(this_month['sales'] or 0),
            'salesDelta': pct_delta(this_month['sales'], last_month['sales']),
            'orders': int(this_week['orders'] or 0),
            'ordersDelta': pct_delta(this_week['orders'], last_week['orders']),
            # extra breakdowns
            'salesWeek': float(this_week['sales'] or 0),
            'salesMonth': float(this_month['sales'] or 0),
            'salesYear': float(this_year['sales'] or 0),
            'ordersWeek': int(this_week['orders'] or 0),
            'ordersMonth': int(this_month['orders'] or 0),
            'ordersYear': int(this_year['orders'] or 0),
        })
    except Exception as e:
        print('[ANALYTICS] Error:', e)
        return jsonify({'error': 'Failed to compute analytics'}), 500
    finally:
        cur.close(); conn.close()

@app.route('/api/seller/analytics/timeseries', methods=['GET'])
@token_required
def seller_analytics_timeseries(current_user):
    """Return time-series sales data for charting.
    Query params: from=YYYY-MM-DD, to=YYYY-MM-DD, granularity=day|week|month
    """
    if current_user.get('role') != 'seller':
        return jsonify({'error': 'Unauthorized'}), 403

    date_from = request.args.get('from')
    date_to = request.args.get('to')
    granularity = request.args.get('granularity', 'day')

    # Default range: last 30 days
    try:
        now = datetime.now()
        if not date_to:
            date_to = now.strftime('%Y-%m-%d')
        if not date_from:
            date_from = (now - timedelta(days=29)).strftime('%Y-%m-%d')
    except Exception:
        pass

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = connection.cursor(dictionary=True)
    try:
        seller_id = current_user['id']
        
        # Only count confirmed and later statuses (not pending)
        if granularity == 'day':
            cursor.execute("""
                SELECT 
                    DATE(o.created_at) as date,
                    COALESCE(SUM(o.total_amount), 0) as sales
                FROM orders o
                WHERE (o.seller_id = %s OR o.id IN (
                    SELECT DISTINCT oi.order_id 
                    FROM order_items oi 
                    JOIN products p ON oi.product_id = p.id 
                    WHERE p.seller_id = %s
                ))
                AND o.status != 'cancelled'
                AND o.status != 'pending'
                AND o.status IN ('confirmed', 'prepared', 'shipped', 'delivered')
                AND DATE(o.created_at) >= %s
                AND DATE(o.created_at) <= %s
                GROUP BY DATE(o.created_at)
                ORDER BY DATE(o.created_at)
            """, (seller_id, seller_id, date_from, date_to))
        elif granularity == 'week':
            cursor.execute("""
                SELECT 
                    YEARWEEK(o.created_at, 1) as week,
                    COALESCE(SUM(o.total_amount), 0) as sales
                FROM orders o
                WHERE (o.seller_id = %s OR o.id IN (
                    SELECT DISTINCT oi.order_id 
                    FROM order_items oi 
                    JOIN products p ON oi.product_id = p.id 
                    WHERE p.seller_id = %s
                ))
                AND o.status != 'cancelled'
                AND o.status != 'pending'
                AND o.status IN ('confirmed', 'prepared', 'shipped', 'delivered')
                AND DATE(o.created_at) >= %s
                AND DATE(o.created_at) <= %s
                GROUP BY YEARWEEK(o.created_at, 1)
                ORDER BY YEARWEEK(o.created_at, 1)
            """, (seller_id, seller_id, date_from, date_to))
        else:  # month
            cursor.execute("""
                SELECT 
                    DATE_FORMAT(o.created_at, '%Y-%m') as month,
                    COALESCE(SUM(o.total_amount), 0) as sales
                FROM orders o
                WHERE (o.seller_id = %s OR o.id IN (
                    SELECT DISTINCT oi.order_id 
                    FROM order_items oi 
                    JOIN products p ON oi.product_id = p.id 
                    WHERE p.seller_id = %s
                ))
                AND o.status != 'cancelled'
                AND o.status != 'pending'
                AND o.status IN ('confirmed', 'prepared', 'shipped', 'delivered')
                AND DATE(o.created_at) >= %s
                AND DATE(o.created_at) <= %s
                GROUP BY DATE_FORMAT(o.created_at, '%Y-%m')
                ORDER BY DATE_FORMAT(o.created_at, '%Y-%m')
            """, (seller_id, seller_id, date_from, date_to))

        rows = cursor.fetchall() or []
        
        # Build labels and sales arrays
        labels = []
        sales = []
        
        if granularity == 'day':
            # Fill in all days in range, even if no sales
            from_date = datetime.strptime(date_from, '%Y-%m-%d')
            to_date = datetime.strptime(date_to, '%Y-%m-%d')
            sales_dict = {row['date'].strftime('%Y-%m-%d'): float(row['sales']) for row in rows}
            
            current = from_date
            while current <= to_date:
                date_str = current.strftime('%Y-%m-%d')
                labels.append(current.strftime('%m-%d'))
                sales.append(float(sales_dict.get(date_str, 0)))
                current += timedelta(days=1)
        elif granularity == 'week':
            for row in rows:
                labels.append(f"Week {row['week']}")
                sales.append(float(row['sales']))
        else:  # month
            for row in rows:
                labels.append(row['month'])
                sales.append(float(row['sales']))

        return jsonify({
            'success': True,
            'labels': labels,
            'sales': sales
        })
    except Exception as e:
        print(f"[TIMESERIES] Error: {e}")
        return jsonify({'error': 'Failed to build timeseries data'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/seller/dashboard-stats', methods=['GET'])
@token_required
def get_dashboard_stats(current_user):
    if current_user['role'] != 'seller':
        return jsonify({'error': 'Unauthorized'}), 403

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = connection.cursor(dictionary=True)
    
    try:
        seller_id = current_user['id']
        print(f"Dashboard API: Looking for products with seller_id = {seller_id}")
        
        # Check if seller has any products first
        cursor.execute("""
            SELECT COUNT(*) as total_products
            FROM products
            WHERE seller_id = %s AND is_active = 1
        """, (seller_id,))
        total_products = cursor.fetchone()['total_products']
        print(f"Found {total_products} products for seller_id = {seller_id}")
        
        # Debug: Show what products exist
        cursor.execute("SELECT id, name, seller_id FROM products WHERE is_active = 1")
        all_products = cursor.fetchall()
        print(f"All products in database: {all_products}")

        # Get orders data - only count confirmed and later statuses for revenue
        # Revenue should only update after seller accepts the order (status = 'confirmed' or later)
        cursor.execute("""
            SELECT 
                COUNT(DISTINCT o.id) as total_orders,
                COALESCE(SUM(o.total_amount), 0) as total_revenue
            FROM orders o
            WHERE o.status != 'cancelled' 
              AND o.status != 'pending'
              AND o.status IN ('confirmed', 'prepared', 'shipped', 'delivered')
              AND (
                o.seller_id = %s OR 
                o.id IN (
                    SELECT DISTINCT oi.order_id 
                    FROM order_items oi 
                    JOIN products p ON oi.product_id = p.id 
                    WHERE p.seller_id = %s
                )
            )
        """, (seller_id, seller_id))
        
        order_stats = cursor.fetchone()
        total_orders = int(order_stats['total_orders']) if order_stats else 0
        total_revenue = float(order_stats['total_revenue']) if order_stats else 0.0
        
        # Get pending orders
        cursor.execute("""
            SELECT COUNT(DISTINCT o.id) as pending_orders
            FROM orders o
            WHERE o.status = 'pending' AND (
                o.seller_id = %s OR 
                o.id IN (
                    SELECT DISTINCT oi.order_id 
                    FROM order_items oi 
                    JOIN products p ON oi.product_id = p.id 
                    WHERE p.seller_id = %s
                )
            )
        """, (seller_id, seller_id))
        
        pending_result = cursor.fetchone()
        pending_orders = int(pending_result['pending_orders']) if pending_result else 0
        
        result = {
            'total_revenue': total_revenue,
            'total_orders': total_orders,
            'total_products': int(total_products),
            'pending_orders': pending_orders
        }
        
        return jsonify(result)

    except Exception as e:
        print(f"Dashboard stats error: {str(e)}")
        return jsonify({
            'error': 'Failed to fetch dashboard statistics', 
            'detail': str(e),
            'total_revenue': 0.0,
            'total_orders': 0,
            'total_products': 0,
            'pending_orders': 0
        }), 200
    finally:
        cursor.close()
        connection.close()

@app.route('/api/seller/best-products', methods=['GET'])
@token_required
def get_best_products(current_user):
    if current_user['role'] != 'seller':
        return jsonify({'error': 'Unauthorized'}), 403

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = connection.cursor(dictionary=True)
    
    try:
        seller_id = current_user['id']
        limit = request.args.get('limit', 5, type=int)
        
        # Get best selling products by quantity sold
        cursor.execute("""
            SELECT p.id, p.name, p.category, 
                   SUM(oi.quantity) as total_sold,
                   SUM(oi.price * oi.quantity) as total_revenue,
                   p.price as current_price,
                   (SELECT pvi.image_url FROM product_variant_images pvi WHERE pvi.product_id = p.id LIMIT 1) as image_url
            FROM products p
            JOIN order_items oi ON p.id = oi.product_id
            JOIN orders o ON oi.order_id = o.id
            WHERE p.seller_id = %s AND o.status != 'cancelled' AND p.is_active = 1
            GROUP BY p.id, p.name, p.category, p.price
            ORDER BY total_sold DESC, total_revenue DESC
            LIMIT %s
        """, (seller_id, limit))
        
        best_products = cursor.fetchall()
        
        # Format the results
        formatted_products = []
        for product in best_products:
            formatted_products.append({
                'id': product['id'],
                'name': product['name'],
                'category': product['category'] or 'Uncategorized',
                'total_sold': int(product['total_sold']),
                'total_revenue': float(product['total_revenue']),
                'current_price': float(product['current_price']) if product['current_price'] else 0,
                'image_url': product['image_url'] or '/static/images/placeholder.jpg'
            })
        
        return jsonify({
            'success': True,
            'products': formatted_products
        })

    except Exception as e:
        print(f"Error getting best products: {str(e)}")
        return jsonify({'error': 'Failed to fetch best selling products'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/seller/recent-orders', methods=['GET'])
@token_required
def get_recent_orders(current_user):
    if current_user['role'] != 'seller':
        return jsonify({'error': 'Unauthorized'}), 403

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = connection.cursor(dictionary=True)
    
    try:
        seller_id = current_user['id']
        limit = request.args.get('limit', 10, type=int)
        
        # Get recent orders for this seller
        cursor.execute("""
            SELECT DISTINCT o.id, o.order_number, o.full_name, o.email, 
                   o.total_amount, o.status, o.payment_status, o.created_at,
                   u.name as buyer_name
            FROM orders o
            LEFT JOIN users u ON o.buyer_id = u.id
            WHERE o.seller_id = %s OR o.id IN (
                SELECT DISTINCT oi.order_id 
                FROM order_items oi 
                JOIN products p ON oi.product_id = p.id 
                WHERE p.seller_id = %s
            )
            ORDER BY o.created_at DESC
            LIMIT %s
        """, (seller_id, seller_id, limit))
        
        recent_orders = cursor.fetchall()
        
        # Format the results
        formatted_orders = []
        for order in recent_orders:
            formatted_orders.append({
                'id': order['id'],
                'order_number': order['order_number'],
                'customer_name': order['buyer_name'] or order['full_name'],
                'email': order['email'],
                'total_amount': float(order['total_amount']),
                'status': order['status'],
                'payment_status': order['payment_status'],
                'created_at': order['created_at'].isoformat() if order['created_at'] else None,
                'time_ago': get_time_ago(order['created_at']) if order['created_at'] else 'Unknown'
            })
        
        return jsonify({
            'success': True,
            'orders': formatted_orders
        })

    except Exception as e:
        print(f"Error getting recent orders: {str(e)}")
        return jsonify({'error': 'Failed to fetch recent orders'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/seller/low-stock', methods=['GET'])
@token_required
def get_low_stock_products(current_user):
    if current_user['role'] != 'seller':
        return jsonify({'error': 'Unauthorized'}), 403

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = connection.cursor(dictionary=True)
    
    try:
        seller_id = current_user['id']
        threshold = request.args.get('threshold', 10, type=int)  # Default threshold of 10
        limit = request.args.get('limit', 10, type=int)
        
        # Get products with low stock
        cursor.execute("""
            SELECT p.id, p.name, p.category,
                   SUM(COALESCE(pss.stock_quantity, 0)) as total_stock,
                   p.price,
                   (SELECT pvi.image_url FROM product_variant_images pvi WHERE pvi.product_id = p.id LIMIT 1) as image_url
            FROM products p
            LEFT JOIN product_size_stock pss ON p.id = pss.product_id
            WHERE p.seller_id = %s AND p.is_active = 1
            GROUP BY p.id, p.name, p.category, p.price
            HAVING total_stock <= %s
            ORDER BY total_stock ASC
            LIMIT %s
        """, (seller_id, threshold, limit))
        
        low_stock_products = cursor.fetchall()
        
        # Format the results
        formatted_products = []
        for product in low_stock_products:
            formatted_products.append({
                'id': product['id'],
                'name': product['name'],
                'category': product['category'] or 'Uncategorized',
                'total_stock': int(product['total_stock']) if product['total_stock'] else 0,
                'price': float(product['price']) if product['price'] else 0,
                'image_url': product['image_url'] or '/static/images/placeholder.jpg'
            })
        
        return jsonify({
            'success': True,
            'products': formatted_products,
            'threshold': threshold
        })

    except Exception as e:
        print(f"Error getting low stock products: {str(e)}")
        return jsonify({'error': 'Failed to fetch low stock products'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/seller/top-customers', methods=['GET'])
@token_required
def get_top_customers(current_user):
    if current_user['role'] != 'seller':
        return jsonify({'error': 'Unauthorized'}), 403

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = connection.cursor(dictionary=True)
    
    try:
        seller_id = current_user['id']
        limit = request.args.get('limit', 10, type=int)
        
        # Get top customers with their favorite products
        cursor.execute("""
            SELECT 
                COALESCE(u.name, o.full_name) as customer_name,
                COALESCE(u.email, o.email) as customer_email,
                COUNT(DISTINCT o.id) as total_orders,
                SUM(o.total_amount) as total_spent,
                MAX(o.created_at) as last_order_date,
                (
                    SELECT p.name 
                    FROM order_items oi2 
                    JOIN products p ON oi2.product_id = p.id 
                    JOIN orders o2 ON oi2.order_id = o2.id
                    WHERE (o2.buyer_id = o.buyer_id OR (o2.buyer_id IS NULL AND o2.email = o.email))
                    AND p.seller_id = %s
                    AND o2.status != 'cancelled'
                    GROUP BY p.id, p.name 
                    ORDER BY SUM(oi2.quantity) DESC 
                    LIMIT 1
                ) as favorite_product,
                (
                    SELECT SUM(oi2.quantity) 
                    FROM order_items oi2 
                    JOIN products p ON oi2.product_id = p.id 
                    JOIN orders o2 ON oi2.order_id = o2.id
                    WHERE (o2.buyer_id = o.buyer_id OR (o2.buyer_id IS NULL AND o2.email = o.email))
                    AND p.seller_id = %s
                    AND o2.status != 'cancelled'
                    GROUP BY p.id 
                    ORDER BY SUM(oi2.quantity) DESC 
                    LIMIT 1
                ) as favorite_product_count
            FROM orders o
            LEFT JOIN users u ON o.buyer_id = u.id
            WHERE o.status != 'cancelled' AND (
                o.seller_id = %s OR o.id IN (
                    SELECT DISTINCT oi.order_id 
                    FROM order_items oi 
                    JOIN products p ON oi.product_id = p.id 
                    WHERE p.seller_id = %s
                )
            )
            GROUP BY 
                COALESCE(u.id, CONCAT('guest_', o.email)), 
                COALESCE(u.name, o.full_name), 
                COALESCE(u.email, o.email)
            HAVING total_orders > 0
            ORDER BY total_spent DESC, total_orders DESC
            LIMIT %s
        """, (seller_id, seller_id, seller_id, seller_id, limit))
        
        top_customers = cursor.fetchall()
        
        # Format the results
        formatted_customers = []
        for customer in top_customers:
            formatted_customers.append({
                'customer_name': customer['customer_name'] or 'Unknown Customer',
                'customer_email': customer['customer_email'] or '',
                'total_orders': int(customer['total_orders']) if customer['total_orders'] else 0,
                'total_spent': float(customer['total_spent']) if customer['total_spent'] else 0.0,
                'last_order_date': customer['last_order_date'].isoformat() if customer['last_order_date'] else None,
                'favorite_product': customer['favorite_product'],
                'favorite_product_count': int(customer['favorite_product_count']) if customer['favorite_product_count'] else 0
            })
        
        return jsonify({
            'success': True,
            'customers': formatted_customers
        })

    except Exception as e:
        print(f"Error getting top customers: {str(e)}")
        return jsonify({'error': 'Failed to fetch top customers'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/categories', methods=['GET'])
def get_categories():
    """Get all categories with product counts"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'categories': []}), 500

    try:
        cursor = connection.cursor(dictionary=True)
        
        # Get categories with product counts
        cursor.execute("""
            SELECT 
                category,
                COUNT(*) as count,
                LOWER(REPLACE(category, ' ', '-')) as slug
            FROM products 
            WHERE is_active = 1 
            GROUP BY category 
            ORDER BY count DESC
        """)
        
        categories_data = cursor.fetchall()
        
        categories = []
        for i, cat in enumerate(categories_data):
            categories.append({
                'id': i + 1,
                'name': cat['category'] or 'Uncategorized',
                'slug': cat['slug'] or 'uncategorized',
                'count': int(cat['count'] or 0)
            })
        
        cursor.close()
        connection.close()
        
        return jsonify({'categories': categories})
        
    except Exception as e:
        print(f"Error fetching categories: {str(e)}")
        if connection:
            connection.close()
        return jsonify({'categories': []}), 500

@app.route('/api/become-seller', methods=['POST'])
@token_required
def become_seller(current_user):
    if current_user['role'] != 'buyer':
        return jsonify({'error': 'Only buyers can apply to become sellers'}), 403
    
    data = request.get_json()
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor()
    
    # Check if application already exists
    cursor.execute("SELECT id FROM applications WHERE user_id = %s AND application_type = 'seller'", 
                  (current_user['id'],))
    if cursor.fetchone():
        cursor.close()
        connection.close()
        return jsonify({'error': 'Application already submitted'}), 400
    
    # Create experience summary from form data
    experience_data = {
        'business_type': data.get('business_type'),
        'business_phone': data.get('business_phone'),
        'business_email': data.get('business_email'),
        'address': f"{data.get('street_address')}, {data.get('city')}, {data.get('state')} {data.get('zip_code')}",
        'categories': data.get('categories', []),
        'description': data.get('business_description'),
        'website': data.get('website'),
        'years_in_business': data.get('years_in_business')
    }
    
    cursor.execute("""
        INSERT INTO applications (
            user_id,
            application_type,
            status,
            business_name,
            business_registration,
            business_email,
            business_phone,
            experience
        )
        VALUES (%s, 'seller', 'pending', %s, %s, %s, %s, %s)
    """, (
        current_user['id'],
        data.get('business_name'),
        data.get('business_reg_number'),
        data.get('business_email'),
        data.get('business_phone'),
        json.dumps(experience_data)
    ))
    
    connection.commit()
    cursor.close()
    connection.close()
    
    return jsonify({
        'success': True, 
        'message': 'Seller application submitted successfully. You will be notified once it is reviewed.'
    })

@app.route('/api/seller/orders', methods=['GET'])
@token_required
def get_seller_orders(current_user):
    if current_user['role'] != 'seller':
        return jsonify({'error': 'Seller access required'}), 403

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        seller_id = current_user['id']
        
        print(f"Fetching orders for seller ID: {seller_id}")

        # Method 1: Direct seller_id lookup
        cursor.execute("""
            SELECT o.*, u.name as buyer_name, u.email as buyer_email, u.profile_picture as buyer_profile_picture
            FROM orders o
            LEFT JOIN users u ON o.buyer_id = u.id
            WHERE o.seller_id = %s
            ORDER BY o.created_at DESC
        """, (seller_id,))
        
        direct_orders = cursor.fetchall()
        print(f"Direct method found {len(direct_orders)} orders")

        # Method 2: Through product relationships (fallback)
        cursor.execute("""
            SELECT DISTINCT o.*, u.name as buyer_name, u.email as buyer_email, u.profile_picture as buyer_profile_picture
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            LEFT JOIN users u ON o.buyer_id = u.id
            WHERE p.seller_id = %s
            ORDER BY o.created_at DESC
        """, (seller_id,))
        
        indirect_orders = cursor.fetchall()
        print(f"Indirect method found {len(indirect_orders)} orders")
        
        # Use whichever method returns more orders
        orders = direct_orders if len(direct_orders) >= len(indirect_orders) else indirect_orders
        print(f"Using orders from {'direct' if orders == direct_orders else 'indirect'} method")

        # Get order items for each order - only items that belong to this seller, include image_url
        for order in orders:
            cursor.execute("""
                SELECT 
                    oi.*,
                    p.name as product_name,
                    COALESCE((SELECT pvi.image_url FROM product_variant_images pvi 
                              WHERE pvi.product_id = p.id 
                              ORDER BY pvi.display_order ASC, pvi.id ASC LIMIT 1),
                             p.image_url) AS image_url
                FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = %s AND p.seller_id = %s
            """, (order['id'], seller_id))
            order['items'] = cursor.fetchall()

        cursor.close()
        connection.close()
        
        print(f"Returning {len(orders)} orders to seller")
        return jsonify({
            'orders': orders,
            'debug_info': {
                'seller_id': seller_id,
                'direct_orders_count': len(direct_orders),
                'indirect_orders_count': len(indirect_orders),
                'method_used': 'direct' if orders == direct_orders else 'indirect'
            }
        })

    except Exception as e:
        print(f"Error fetching orders: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to fetch orders', 'detail': str(e)}), 500
    


@app.route('/api/debug/products', methods=['GET'])
@token_required
def debug_products(current_user):
    """Debug endpoint to check product image_url values"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get first 5 products with all fields
        cursor.execute("""
            SELECT id, name, 
                   (SELECT pvi.image_url FROM product_variant_images pvi WHERE pvi.product_id = id ORDER BY pvi.display_order ASC, pvi.id ASC LIMIT 1) AS image_url, 
                   category, created_at
            FROM products 
            WHERE seller_id = %s
            ORDER BY created_at DESC
            LIMIT 5
        """, (current_user['id'],))
        
        products = cursor.fetchall()
        
        return jsonify({
            'success': True,
            'products': products,
            'seller_id': current_user['id']
        })
        
    except Exception as e:
        print(f"Debug error: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/fix/product-images', methods=['POST'])
@token_required
def fix_product_images(current_user):
    """Deprecated: Images handled by product_variant_images; no-op."""
    return jsonify({'success': True, 'message': 'No migration needed. Product images are sourced from product_variant_images.'}), 200
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = connection.cursor(dictionary=True)
    
    try:
        # Find products without image_url that have variant images
        cursor.execute("""
            SELECT DISTINCT p.id, p.name,
                   (SELECT pvi.image_url 
                    FROM product_variant_images pvi 
                    WHERE pvi.product_id = p.id 
                    ORDER BY pvi.display_order 
                    LIMIT 1) as first_variant_image,
                   (SELECT pss.image_url 
                    FROM product_size_stock pss 
                    WHERE pss.product_id = p.id AND pss.image_url IS NOT NULL 
                    LIMIT 1) as first_stock_image
            FROM products p
            WHERE p.seller_id = %s 
              AND (p.image_url IS NULL OR p.image_url = '')
        """, (current_user['id'],))
        
        products_to_fix = cursor.fetchall()
        fixed_count = 0
        
        for product in products_to_fix:
            # Use first variant image or first stock image
            image_to_use = product['first_variant_image'] or product['first_stock_image']
            
            if image_to_use:
                cursor.execute("""
                    UPDATE products 
                    SET image_url = %s 
                    WHERE id = %s
                """, (image_to_use, product['id']))
                fixed_count += 1
                print(f"Fixed product {product['id']} ({product['name']}) with image: {image_to_use}")
        
        connection.commit()
        
        return jsonify({
            'success': True,
            'message': f'Fixed {fixed_count} products',
            'fixed_count': fixed_count,
            'total_checked': len(products_to_fix)
        })
        
    except Exception as e:
        connection.rollback()
        print(f"Error fixing product images: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/seller/inventory', methods=['GET'])
@token_required
def get_seller_inventory(current_user):
    if current_user['role'] != 'seller':
        return jsonify({'error': 'Unauthorized'}), 403

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = connection.cursor(dictionary=True)
    
    try:
        view = request.args.get('view', 'product')
        search = request.args.get('search', '')
        approval_status = request.args.get('approval_status', '')
        stock_filter = request.args.get('stock_filter', '')
        sort_by = request.args.get('sort_by', 'created')
        quick_filter = request.args.get('quick_filter', '')  # all, low-stock, out-of-stock, flash-sale, recent
        
        # Pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        per_page = max(1, min(per_page, 100))  # Limit between 1 and 100
        page = max(1, page)  # Ensure page is at least 1
        offset = (page - 1) * per_page

        if view == 'product':
            # Get products with aggregated variant data
            query = """
                SELECT 
                    p.*,
                    GROUP_CONCAT(DISTINCT pss.size) as sizes,
                    COUNT(DISTINCT CONCAT(pss.size, pss.color)) as variant_count,
                    SUM(pss.stock_quantity) as total_stock,
                    MIN(pss.price) as min_price,
                    MAX(pss.price) as max_price
        FROM products p
        LEFT JOIN product_size_stock pss ON p.id = pss.product_id
        WHERE p.seller_id = %s
            """
            params = [current_user['id']]

            if search:
                query += " AND (p.name LIKE %s OR p.description LIKE %s)"
                params.extend([f'%{search}%', f'%{search}%'])

            if approval_status:
                query += " AND p.approval_status = %s"
                params.append(approval_status)
            
            # Handle quick filters
            if quick_filter == 'flash-sale':
                query += " AND p.is_flash_sale = 1"
            elif quick_filter == 'recent':
                # Products created in the last 7 days
                query += " AND p.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"

            # Handle sorting
            order_by = "p.created_at DESC"  # Default
            if sort_by == 'name':
                order_by = "p.name ASC"
            elif sort_by == 'name_desc':
                order_by = "p.name DESC"
            elif sort_by == 'created':
                order_by = "p.created_at DESC"
            elif sort_by == 'created_desc':
                order_by = "p.created_at ASC"
            elif sort_by == 'stock':
                # For stock sorting, use the aggregate function directly
                order_by = "SUM(pss.stock_quantity) DESC"
            elif sort_by == 'stock_desc':
                order_by = "SUM(pss.stock_quantity) ASC"
            
            query += f" GROUP BY p.id ORDER BY {order_by}"

            cursor.execute(query, params)
            all_products = cursor.fetchall()

            # Apply stock filter first, then paginate
            filtered_products = []
            for product in all_products:
                # Skip products with no variants if looking for in-stock items
                if stock_filter == 'in' and not product['total_stock']:
                    continue
                if stock_filter == 'out' and product['total_stock'] > 0:
                    continue
                if stock_filter == 'low' and product['total_stock'] > 10:
                    continue
                filtered_products.append(product)
            
            # Get total count after filtering
            total_count = len(filtered_products)
            
            # Apply pagination
            products = filtered_products[offset:offset + per_page]

            items = []
            for product in products:

                # Get color variants with images for this product
                cursor.execute("""
                    SELECT DISTINCT 
                        pss.color,
                        pss.color_name,
                        MIN(pss.price) as min_price,
                        MAX(pss.price) as max_price,
                        SUM(pss.stock_quantity) as total_stock
                    FROM product_size_stock pss
                    WHERE pss.product_id = %s
                    GROUP BY pss.color, pss.color_name
                    ORDER BY pss.color
                """, (product['id'],))
                
                color_variants_data = cursor.fetchall()
                color_variants = []
                
                for variant_data in color_variants_data:
                    # Get images specifically for this color variant first
                    cursor.execute("""
                        SELECT image_url, display_order
                        FROM product_variant_images
                        WHERE product_id = %s AND color = %s
                        ORDER BY display_order ASC, id ASC
                    """, (product['id'], variant_data['color']))
                    
                    variant_images = cursor.fetchall()
                    
                    # If no color-specific images found, use default images as fallback
                    if not variant_images:
                        cursor.execute("""
                            SELECT image_url, display_order
                            FROM product_variant_images
                            WHERE product_id = %s AND color = 'default'
                            ORDER BY display_order ASC, id ASC
                        """, (product['id'],))
                        variant_images = cursor.fetchall()
                    
                    # Transform images to the expected format
                    images = [{
                        'url': img['image_url'],
                        'display_order': img['display_order'] or 0
                    } for img in variant_images]
                    
                    # Get color hex value (you might want to add this to your color mapping)
                    color_hex_map = {
                        'black': '#000000', 'white': '#FFFFFF', 'red': '#FF0000', 
                        'blue': '#0000FF', 'green': '#008000', 'yellow': '#FFFF00',
                        'pink': '#FFC0CB', 'purple': '#800080', 'gray': '#808080',
                        'grey': '#808080', 'brown': '#A52A2A', 'beige': '#F5F5DC',
                        'navy': '#000080', 'orange': '#FFA500', 'coral': '#FF7F50',
                        'maroon': '#800000', 'olive': '#808000', 'teal': '#008080',
                        'silver': '#C0C0C0', 'gold': '#FFD700'
                    }
                    
                    color_hex = color_hex_map.get(variant_data['color'].lower(), '#808080')
                    
                    # Use color_name as the primary display value, fallback to a readable name if needed
                    display_name = variant_data['color_name'] if variant_data['color_name'] else (
                        'Black' if variant_data['color'] == '#000000' else
                        'White' if variant_data['color'] == '#FFFFFF' else
                        variant_data['color']
                    )
                    
                    color_variants.append({
                        'color': display_name,  # Use color name for display
                        'color_name': display_name,  # Keep for compatibility
                        'color_hex': color_hex,  # Keep hex for styling
                        'images': images,
                        'min_price': float(variant_data['min_price']) if variant_data['min_price'] else 0,
                        'max_price': float(variant_data['max_price']) if variant_data['max_price'] else 0,
                        'stock': variant_data['total_stock'] or 0
                    })
                
                # Get default image URL (primary product image or first variant image)
                default_image_url = product.get('image_url')
                if not default_image_url and color_variants:
                    # Use first image from first color variant
                    for variant in color_variants:
                        if variant['images']:
                            default_image_url = variant['images'][0]['url']
                            break
                
                if not default_image_url:
                    default_image_url = '/static/image.png'

                items.append({
                    'id': product['id'],
                    'name': product['name'],
                    'description': product['description'],
                    'category': product['category'],
                    'approval_status': product.get('approval_status', 'pending'),
                    'created_at': product['created_at'].isoformat() if product['created_at'] else None,
                    'is_flash_sale': bool(product.get('is_flash_sale', 0)),
                    
                    # Legacy fields for backward compatibility
                    'image_url': default_image_url,
                    'sizes': product['sizes'].split(',') if product['sizes'] else [],
                    'variant_count': product['variant_count'] or 0,
                    'total_stock': product['total_stock'] or 0,
                    'price_range': (
                        f"₱{float(product['min_price']):.2f}" 
                        if product['min_price'] == product['max_price'] 
                        else f"₱{float(product['min_price']):.2f} - ₱{float(product['max_price']):.2f}"
                    ) if product['min_price'] and product['max_price'] else '-',
                    'status': 'Out of Stock' if not product['total_stock'] else 'In Stock',
                    'status_class': 'text-danger' if not product['total_stock'] else 'text-success',
                    
                    # New structure expected by frontend
                    'default_image_url': default_image_url,
                    'color_variants': color_variants
                })

        else:  # variant view
            query = """
                SELECT 
                    p.id as product_id,
                    p.name as product_name,
                    p.category,
                    p.approval_status,
                    pss.*,
                    (SELECT pvi.image_url FROM product_variant_images pvi 
                     WHERE pvi.product_id = p.id AND pvi.color = pss.color 
                     ORDER BY pvi.display_order ASC, pvi.id ASC LIMIT 1) AS image_url,
                    (SELECT COUNT(*) FROM product_variant_images pvi2 
                     WHERE pvi2.product_id = p.id AND pvi2.color = pss.color) as image_count
                FROM products p
                JOIN product_size_stock pss ON p.id = pss.product_id
                WHERE p.seller_id = %s
            """
            params = [current_user['id']]

            if search:
                query += " AND (p.name LIKE %s OR p.description LIKE %s)"
                params.extend([f'%{search}%', f'%{search}%'])

            if approval_status:
                query += " AND p.approval_status = %s"
                params.append(approval_status)
            
            # Handle quick filters for variant view
            if quick_filter == 'flash-sale':
                query += " AND p.is_flash_sale = 1"
            elif quick_filter == 'recent':
                # Products created in the last 7 days
                query += " AND p.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"

            # Handle sorting for variant view
            order_by = "p.created_at DESC, pss.size, pss.color"  # Default
            if sort_by == 'name':
                order_by = "p.name ASC, pss.size, pss.color"
            elif sort_by == 'name_desc':
                order_by = "p.name DESC, pss.size, pss.color"
            elif sort_by == 'created':
                order_by = "p.created_at DESC, pss.size, pss.color"
            elif sort_by == 'created_desc':
                order_by = "p.created_at ASC, pss.size, pss.color"
            elif sort_by == 'stock':
                order_by = "pss.stock_quantity DESC, p.name, pss.size, pss.color"
            elif sort_by == 'stock_desc':
                order_by = "pss.stock_quantity ASC, p.name, pss.size, pss.color"
            
            query += f" ORDER BY {order_by}"

            cursor.execute(query, params)
            all_variants = cursor.fetchall()

            # Apply stock filter first, then paginate
            filtered_variants = []
            for variant in all_variants:
                if stock_filter == 'in' and not variant['stock_quantity']:
                    continue
                if stock_filter == 'out' and variant['stock_quantity'] > 0:
                    continue
                if stock_filter == 'low' and variant['stock_quantity'] > 10:
                    continue
                filtered_variants.append(variant)
            
            # Get total count after filtering
            total_count = len(filtered_variants)
            
            # Apply pagination
            paginated_variants = filtered_variants[offset:offset + per_page]

            items = []
            for variant in paginated_variants:
                variant_image_url = variant['image_url'] if variant['image_url'] else '/static/image.png'

                items.append({
                    'variant_id': variant['id'],
                    'product_id': variant['product_id'],
                    'product_name': variant['product_name'],
                    'category': variant['category'],
                    'approval_status': variant.get('approval_status', 'pending'),
                    'image_url': variant_image_url,
                    'size': variant['size'],
                    'color': variant['color'],
                    'color_name': variant['color_name'],
                    'stock': variant['stock_quantity'],
                    'price': float(variant['price']),
                    'image_count': variant['image_count'],
                    'status': 'Out of Stock' if not variant['stock_quantity'] else 'In Stock',
                    'status_class': 'text-danger' if not variant['stock_quantity'] else 'text-success'
                })

        print(f"[INVENTORY] Returning {len(items)} items for seller {current_user['id']} (view: {view}, page: {page}, per_page: {per_page})")
        
        # Calculate pagination metadata
        total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1
        has_next = page < total_pages
        has_prev = page > 1
        
        return jsonify({
            'success': True,
            'items': items,
            'total': total_count,
            'page': page,
            'per_page': per_page,
            'total_pages': total_pages,
            'has_next': has_next,
            'has_prev': has_prev,
            'view': view,
            'seller_id': current_user['id']
        })

    except Exception as e:
        print(f"Error getting inventory: {str(e)}")
        return jsonify({'error': 'Failed to fetch inventory data'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/orders/<int:order_id>/history', methods=['GET'])
@token_required
def get_order_history(current_user, order_id):
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = connection.cursor(dictionary=True)
    try:
        # Basic auth: buyer who owns order OR seller who owns items
        cur.execute("SELECT buyer_id, seller_id FROM orders WHERE id = %s", (order_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({'error': 'Order not found'}), 404
        role = current_user.get('role')
        allowed = False
        if role == 'buyer' and row.get('buyer_id') == current_user.get('id'):
            allowed = True
        if role == 'seller' and row.get('seller_id') == current_user.get('id'):
            allowed = True
        if not allowed:
            return jsonify({'error': 'Unauthorized'}), 403

        cur.execute("SELECT status, created_at FROM order_status_history WHERE order_id = %s ORDER BY created_at ASC", (order_id,))
        history = cur.fetchall() or []
        # Include cancel_reason if any
        cur.execute("SELECT cancel_reason FROM orders WHERE id = %s", (order_id,))
        cr = cur.fetchone()
        return jsonify({
            'success': True,
            'history': [
                {
                    'status': h['status'],
                    'timestamp': h['created_at'].isoformat() if h.get('created_at') else None
                } for h in history
            ],
            'cancel_reason': (cr or {}).get('cancel_reason')
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()
        connection.close()

@app.route('/api/orders/<order_identifier>', methods=['GET'])
@token_required
def get_order_details(current_user, order_identifier):
    """Get detailed order information - accepts order ID (int) or order_number (string)"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = connection.cursor(dictionary=True)
    
    try:
        # Check if order_identifier is numeric (order ID) or alphanumeric (order number)
        if order_identifier.isdigit():
            # It's an order ID
            cursor.execute("""
                SELECT 
                    o.*,
                    u.name as buyer_name,
                    u.email as buyer_email,
                    u.phone as buyer_phone
                FROM orders o
                LEFT JOIN users u ON o.buyer_id = u.id
                WHERE o.id = %s
            """, (int(order_identifier),))
        else:
            # It's an order number
            cursor.execute("""
                SELECT 
                    o.*,
                    u.name as buyer_name,
                    u.email as buyer_email,
                    u.phone as buyer_phone
                FROM orders o
                LEFT JOIN users u ON o.buyer_id = u.id
                WHERE o.order_number = %s
            """, (order_identifier,))
        
        order = cursor.fetchone()
        if not order:
            return jsonify({'error': 'Order not found'}), 404

        # Authorization check
        role = current_user.get('role')
        if role == 'buyer' and order.get('buyer_id') != current_user.get('id'):
            return jsonify({'error': 'Unauthorized'}), 403
        elif role == 'seller':
            # Check if seller has products in this order
            cursor.execute("""
                SELECT COUNT(*) as cnt
                FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = %s AND p.seller_id = %s
            """, (order['id'], current_user['id']))
            cnt = cursor.fetchone()['cnt']
            if cnt == 0:
                return jsonify({'error': 'Unauthorized'}), 403

        # Get order items with seller information from applications table
        cursor.execute("""
              SELECT 
                  oi.*,
                  p.name as product_name,
                  COALESCE((SELECT pvi.image_url FROM product_variant_images pvi WHERE pvi.product_id = p.id ORDER BY pvi.display_order ASC, pvi.id ASC LIMIT 1), p.image_url) AS image_url,
                  p.seller_id,
                  u.name as seller_name,
                  u.email as seller_email,
                  u.phone as seller_phone,
                  a.business_name,
                  a.business_registration,
                  u.phone as business_phone,
                  u.email as business_email
              FROM order_items oi
              JOIN products p ON oi.product_id = p.id
              LEFT JOIN users u ON p.seller_id = u.id
              LEFT JOIN applications a ON p.seller_id = a.user_id AND a.status = 'approved'
              WHERE oi.order_id = %s
          """, (order['id'],))

        items = cursor.fetchall()

        # Format the response
        detailed_order = {
            'id': order['id'],
            'order_number': order['order_number'],
            'status': order['status'],
            'payment_status': order.get('payment_status', 'pending'),
            'payment_method': order.get('payment_method'),
            'total_amount': float(order['total_amount']),
            'created_at': order['created_at'].isoformat() if order.get('created_at') else None,
            'tracking_number': order.get('tracking_number'),
            'special_notes': order.get('special_notes', ''),
            'buyer': {
                'name': order.get('buyer_name', 'N/A'),
                'full_name': order.get('full_name') or order.get('buyer_name', 'N/A'),
                'email': order.get('buyer_email', 'N/A'),
                'phone': order.get('buyer_phone', 'N/A')
            },
            'customer_name': order.get('full_name') or order.get('buyer_name'),
            'shipping': {
                'address': order.get('address', ''),
                'city': order.get('city', ''),
                'postal_code': order.get('postal_code', ''),
                'country': order.get('country', 'Philippines'),
                'full_address': f"{order.get('address', '')}, {order.get('city', '')} {order.get('postal_code', '')}, {order.get('country', 'Philippines')}"
            },
            'items': [{
                'id': item['id'],
                'product_id': item['product_id'],
                'name': item['product_name'],
                'quantity': item['quantity'],
                'price': float(item['price']),
                'subtotal': float(item['price'] * item['quantity']),
                'image_url': item.get('image_url', ''),
                'size': item.get('size', ''),
                'color': item.get('color', ''),
                'seller_name': item.get('seller_name', 'Unknown Seller'),
                'seller_info': {
                    'business_name': item.get('business_name') or item.get('seller_name', 'N/A'),
                    'business_registration': item.get('business_registration', 'N/A'),
                    'business_name': item.get('business_name', 'N/A'),
                    'phone': item.get('business_phone') or item.get('seller_phone', 'N/A'),
                    'email': item.get('business_email') or item.get('seller_email', 'N/A')
                }
            } for item in items]
        }

        return jsonify({
            'success': True,
            'order': detailed_order
        })

    except Exception as e:
        print(f"Error fetching order details: {str(e)}")
        return jsonify({'error': 'Failed to fetch order details'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/orders/<int:order_id>/valid-statuses', methods=['GET'])
@token_required
def get_valid_order_statuses(current_user, order_id):
    """Get valid status transitions for an order"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = connection.cursor(dictionary=True)
    
    try:
        cursor.execute("SELECT status FROM orders WHERE id = %s", (order_id,))
        order = cursor.fetchone()
        
        if not order:
            return jsonify({'error': 'Order not found'}), 404
        
        current_status = order['status']
        user_role = current_user.get('role')
        valid_statuses = get_valid_next_statuses(current_status, user_role)
        
        return jsonify({
            'success': True,
            'current_status': current_status,
            'valid_next_statuses': valid_statuses,
            'user_role': user_role
        })
        
    except Exception as e:
        print(f"Error getting valid statuses: {str(e)}")
        return jsonify({'error': 'Failed to get valid statuses'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/seller/products', methods=['GET'])
@token_required
def get_seller_products(current_user):
    if current_user['role'] != 'seller':
        return jsonify({'error': 'Access denied'}), 403
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get seller's products with size pricing
        cursor.execute("""
            SELECT p.id, p.name, p.description, p.price, p.category, p.image_url,
                   p.total_stock, p.sizes, p.size_pricing, p.created_at
            FROM products p
            WHERE p.seller_id = %s AND p.is_active = 1
            ORDER BY p.created_at DESC
        """, (current_user['id'],))
        
        products = cursor.fetchall() or []
        
        # Process each product to include size pricing info
        processed_products = []
        for product in products:
            # Parse size pricing
            size_pricing = {}
            if product.get('size_pricing'):
                try:
                    size_pricing = json.loads(product['size_pricing'])
                except (json.JSONDecodeError, TypeError):
                    size_pricing = {}
            
            processed_products.append({
                'id': product['id'],
                'name': product['name'],
                'description': product.get('description', ''),
                'price': float(product['price']) if product['price'] else 0,
                'category': product.get('category', ''),
                'image_url': product.get('image_url', ''),
                'total_stock': product.get('total_stock', 0),
                'sizes': json.loads(product['sizes']) if product.get('sizes') else [],
                'size_pricing': size_pricing,  # Include size pricing data
                'created_at': product['created_at'].isoformat() if product.get('created_at') else None
            })
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'products': processed_products,
            'total': len(processed_products)
        })
        
    except Exception as e:
        cursor.close()
        connection.close()
        return jsonify({'error': str(e)}), 500
    
xendit_service = XenditService(secret_key=XENDIT_SECRET_KEY, public_key=XENDIT_PUBLIC_KEY)

@app.route('/api/create-payment-source', methods=['POST'])
@token_required
def create_payment_source(current_user):
    """Create Xendit payment for all payment methods (unified endpoint)"""
    try:
        data = request.get_json()
        order_number = data.get('order_number')
        amount = data.get('amount')
        
        if not order_number or not amount:
            return jsonify({"error": "Missing order number or amount"}), 400
            
        base_url = request.host_url.rstrip('/')
        success_url = f"{base_url}/payment/success?order_number={order_number}"
        failure_url = f"{base_url}/payment/failed?order_number={order_number}"
        
        print(f"Creating Xendit payment for order {order_number}, amount: {amount}")
        
        result = xendit_service.create_payment_request(
            amount=amount,
            reference_id=order_number,
            description=f"Payment for order {order_number}",
            success_redirect_url=success_url,
            failure_redirect_url=failure_url
        )
        
        print(f"Xendit payment created: {result}")
        
        return jsonify({
            "success": True,
            "redirect_url": result['checkout_url'],
            "invoice_id": result['invoice_id']
        })
        
    except Exception as e:
        print(f"Error creating Xendit payment: {str(e)}")
        return jsonify({"error": str(e)}), 400

@app.route('/api/process-card-payment', methods=['POST'])
@token_required
def process_card_payment(current_user):
    try:
        data = request.get_json()
        # For demo purposes, simulate successful payment
        # In production, you'd actually process with Xendit
        charge_result = {
            "status": "CAPTURED",  # Simulate success
            "id": f"charge_{data.get('order_id', '')}"
        }
        
        return jsonify({
            "success": True,
            "status": "completed",
            "charge_id": charge_result["id"]
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400

@app.route('/webhooks/xendit', methods=['POST'])
def handle_webhook():
    webhook_token = request.headers.get('X-CALLBACK-TOKEN')
    if not xendit_service.verify_webhook(webhook_token, XENDIT_WEBHOOK_TOKEN):
        return jsonify({"error": "Invalid webhook token"}), 401

    try:
        data = request.get_json() or {}
        reference_id = data.get('reference_id') or data.get('external_id') or data.get('order_number')
        status = (data.get('status') or '').lower()
        if not reference_id:
            return jsonify({"error":"Missing reference_id"}), 400

        payment_ok = status in ['paid','settled','succeeded','captured','paid_out']

        connection = get_db_connection()
        if not connection:
            return jsonify({"error":"DB connection failed"}), 500
        cursor = connection.cursor(dictionary=True)
        # Fetch order by order_number
        cursor.execute("SELECT * FROM orders WHERE order_number = %s", (reference_id,))
        order = cursor.fetchone()
        if not order:
            cursor.close(); connection.close()
            return jsonify({"error":"Order not found"}), 404

        # Update payment_status
        cursor.execute("UPDATE orders SET payment_status = %s WHERE order_number = %s", ('paid' if payment_ok else 'failed', reference_id))
        connection.commit()
        cursor.close(); connection.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/payment/success')
def payment_success():
    """Display successful order details"""
    try:
        # Get order number from query params or session
        order_number = (
            request.args.get('order_number') or 
            request.args.get('external_id') or 
            session.get('order_number')
        )
        
        if not order_number:
            return render_template('Public/payment_success.html',
                                error="Order details not found")

        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        # Get order details
        cursor.execute("""
            SELECT o.*, u.name as buyer_name 
            FROM orders o
            LEFT JOIN users u ON o.buyer_id = u.id
            WHERE o.order_number = %s
        """, (order_number,))
        
        order = cursor.fetchone()
        
        if not order:
            return render_template('Public/payment_success.html',
                                error="Order not found")

        # Get order items
        cursor.execute("""
            SELECT oi.*, p.name as product_name, 
                   (SELECT pvi.image_url FROM product_variant_images pvi WHERE pvi.product_id = p.id ORDER BY pvi.display_order ASC LIMIT 1) AS image_url
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = %s
        """, (order['id'],))
        
        items = cursor.fetchall()

        # Update payment status only - order remains pending for seller confirmation
        cursor.execute("""
            UPDATE orders 
            SET payment_status = 'paid'
            WHERE order_number = %s
        """, (order_number,))
        
        print(f"Payment successful for order {order_number} - Order remains pending for seller confirmation")
        
        connection.commit()
        cursor.close()
        connection.close()

        # Clear order number from session
        session.pop('order_number', None)

        return render_template('Public/payment_success.html',
                            order=order,
                            items=items,
                            transaction_id=order_number)

    except Exception as e:
        print(f"Error in payment_success: {str(e)}")
        return render_template('Public/payment_success.html',
                            error="Error loading order details")


@app.route('/payment/failed')
def payment_failed():
    """Payment failed page"""
    return render_template('Public/payment_failed.html')

@app.route('/order/summary')
def order_summary():
    """Order summary/details page"""
    return render_template('Public/order_summary.html')

@app.route('/api/orders/<order_number>/cod-complete', methods=['POST'])
@token_required  
def complete_cod_order(current_user, order_number):
    """Complete COD order without payment processing"""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = connection.cursor(dictionary=True)
        
        # Verify order exists and belongs to current user
        cursor.execute("""
            SELECT o.*, u.name as buyer_name 
            FROM orders o
            LEFT JOIN users u ON o.buyer_id = u.id
            WHERE o.order_number = %s AND o.buyer_id = %s
        """, (order_number, current_user['id']))
        
        order = cursor.fetchone()
        
        if not order:
            return jsonify({'error': 'Order not found or unauthorized'}), 404
            
        if order['payment_method'] != 'COD':
            return jsonify({'error': 'This endpoint is only for COD orders'}), 400
            
        # For COD, we don't need to process payment, just mark as completed
        # Stock was already deducted during order creation
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'order_number': order_number,
            'message': 'COD order completed successfully',
            'order': {
                'id': order['id'],
                'order_number': order['order_number'],
                'status': order['status'],
                'payment_method': order['payment_method'],
                'total_amount': float(order['total_amount'])
            }
        })
        
    except Exception as e:
        print(f"Error completing COD order: {str(e)}")
        return jsonify({'error': 'Failed to complete COD order'}), 500

@app.route('/api/payment-status/<payment_id>')
@token_required
def get_payment_status(current_user, payment_id):
    """Get payment status"""
    try:
        payment_type = request.args.get('type', 'payment_request')
        status = xendit_service.get_payment_status(payment_id, payment_type)
        
        if status:
            return jsonify({'success': True, 'status': status})
        
        return jsonify({'success': False, 'error': 'Payment not found'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    
@app.route('/api/xendit-public-key')
def get_xendit_public_key():
    return jsonify({
        "publicKey": os.getenv('XENDIT_PUBLIC_KEY')
    })

@app.route('/api/debug/auth', methods=['GET'])
def debug_auth_status():
    """Debug endpoint to check authentication status"""
    auth_header = request.headers.get('Authorization')
    
    debug_info = {
        'headers': {
            'authorization_present': bool(auth_header),
            'authorization_header': auth_header[:50] + '...' if auth_header and len(auth_header) > 50 else auth_header,
            'content_type': request.headers.get('Content-Type'),
            'user_agent': request.headers.get('User-Agent', '')[:100]
        },
        'cookies': dict(request.cookies),
        'session': dict(session) if session else {},
        'timestamp': datetime.now().isoformat()
    }
    
    if not auth_header or not auth_header.startswith('Bearer '):
        debug_info['error'] = 'No Bearer token in Authorization header'
        return jsonify(debug_info), 401
    
    try:
        token = auth_header.split(" ")[1]
        debug_info['token'] = {
            'present': bool(token),
            'length': len(token) if token else 0,
            'starts_with': token[:10] + '...' if token and len(token) > 10 else token
        }
        
        if not token or token.lower() == 'null':
            debug_info['error'] = 'Token is null or empty'
            return jsonify(debug_info), 401
        
        # Try to decode token
        data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
        debug_info['token']['decoded'] = {
            'user_id': data.get('user_id'),
            'exp': data.get('exp'),
            'iat': data.get('iat'),
            'is_expired': data.get('exp', 0) < time.time() if data.get('exp') else False
        }
        
        # Try to get user from database
        connection = get_db_connection()
        if connection:
            cursor = connection.cursor(dictionary=True)
            cursor.execute('SELECT id, name, email, role FROM users WHERE id = %s', (data.get('user_id'),))
            user = cursor.fetchone()
            cursor.close()
            connection.close()
            
            debug_info['user'] = user if user else 'User not found in database'
        else:
            debug_info['database'] = 'Connection failed'
        
        return jsonify(debug_info)
        
    except jwt.ExpiredSignatureError:
        debug_info['error'] = 'Token has expired'
        return jsonify(debug_info), 401
    except jwt.InvalidTokenError as e:
        debug_info['error'] = f'Invalid token: {str(e)}'
        return jsonify(debug_info), 401
    except Exception as e:
        debug_info['error'] = f'Unexpected error: {str(e)}'
        return jsonify(debug_info), 500

@app.route('/api/seller/test-auth', methods=['GET'])
@token_required
def test_seller_auth(current_user):
    return jsonify({
        'success': True,
        'user': {
            'id': current_user.get('id'),
            'role': current_user.get('role'),
            'name': current_user.get('name')
        },
        'message': 'Seller authentication working'
    })

@app.route('/api/seller/products/count', methods=['GET'])
@token_required
def get_seller_product_count(current_user):
    """Quick endpoint to check how many products a seller has"""
    if current_user['role'] != 'seller':
        return jsonify({'error': 'Unauthorized'}), 403
        
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
        
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Count total products
        cursor.execute(
            "SELECT COUNT(*) as count FROM products WHERE seller_id = %s",
            (current_user['id'],)
        )
        total_products = cursor.fetchone()['count']
        
        # Count active products
        cursor.execute(
            "SELECT COUNT(*) as count FROM products WHERE seller_id = %s AND is_active = 1",
            (current_user['id'],)
        )
        active_products = cursor.fetchone()['count']
        
        # Get recent products
        cursor.execute(
            "SELECT id, name, created_at, total_stock FROM products WHERE seller_id = %s ORDER BY created_at DESC LIMIT 5",
            (current_user['id'],)
        )
        recent_products = cursor.fetchall()
        
        return jsonify({
            'success': True,
            'seller_id': current_user['id'],
            'total_products': total_products,
            'active_products': active_products,
            'recent_products': [{
                'id': p['id'],
                'name': p['name'],
                'created_at': p['created_at'].isoformat() if p['created_at'] else None,
                'total_stock': p['total_stock']
            } for p in recent_products]
        })
        
    except Exception as e:
        print(f"Error getting seller product count: {str(e)}")
    finally:
        cursor.close()
        connection.close()

@app.route('/api/seller/category', methods=['GET'])
@token_required
def get_seller_category(current_user):
    """Get the seller's registered category from their approved application"""
    if current_user['role'] != 'seller':
        return jsonify({'error': 'Seller access required'}), 403
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        # Get category from approved seller application
        cursor.execute(
            """
            SELECT experience
            FROM applications
            WHERE user_id = %s AND application_type = 'seller' AND status = 'approved'
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (current_user['id'],)
        )
        app_row = cursor.fetchone()
        
        if not app_row:
            # Fallback: try to get from user's address JSON (registration)
            cursor.execute(
                "SELECT address FROM users WHERE id = %s",
                (current_user['id'],)
            )
            user_row = cursor.fetchone()
            if user_row and user_row.get('address'):
                try:
                    import json
                    address_data = json.loads(user_row['address'])
                    additional_info = address_data.get('additional_info', {})
                    categories = additional_info.get('categories', [])
                    primary_category = additional_info.get('primary_category')
                    
                    if categories:
                        allowed_categories = categories if isinstance(categories, list) else [categories]
                    elif primary_category:
                        allowed_categories = [primary_category]
                    else:
                        allowed_categories = []
                    
                    if allowed_categories:
                        return jsonify({
                            'success': True,
                            'categories': allowed_categories,
                            'primary_category': allowed_categories[0]
                        })
                except Exception as e:
                    print(f"Error parsing user address: {e}")
            
            return jsonify({'error': 'No approved seller application or category found'}), 404
        
        # Parse experience JSON
        allowed_categories = []
        try:
            import json
            exp = json.loads(app_row['experience']) if isinstance(app_row.get('experience'), str) else (app_row.get('experience') or {})
        except Exception:
            exp = {}
        
        cats = (exp or {}).get('categories')
        if isinstance(cats, list):
            allowed_categories = [str(c).strip() for c in cats if c]
        elif isinstance(cats, str) and cats.strip():
            allowed_categories = [cats.strip()]
        
        if not allowed_categories:
            return jsonify({'error': 'No category found in seller application'}), 404
        
        return jsonify({
            'success': True,
            'categories': allowed_categories,
            'primary_category': allowed_categories[0]
        })
        
    except Exception as e:
        print(f"Error fetching seller category: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/products/<int:product_id>/stock', methods=['GET', 'PUT'])
@token_required
def manage_product_stock(current_user, product_id):
    """Get or update stock information for a product"""
    if request.method == 'GET':
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        try:
            cursor = connection.cursor(dictionary=True)
            cursor.execute("""
                SELECT id, name, total_stock, seller_id
                FROM products 
                WHERE id = %s
            """, (product_id,))
            product = cursor.fetchone()
            
            if not product:
                return jsonify({'error': 'Product not found'}), 404
            
            cursor.execute("""
                SELECT size, color, color_name, stock_quantity, price, discount_price
                FROM product_size_stock 
                WHERE product_id = %s
                ORDER BY size, color
            """, (product_id,))
            stock_variants = cursor.fetchall()
            
            cursor.execute("""
                SELECT oi.quantity, oi.size, oi.color, o.order_number, o.status, o.created_at
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                WHERE oi.product_id = %s
                ORDER BY o.created_at DESC
                LIMIT 10
            """, (product_id,))
            recent_orders = cursor.fetchall()
            
            return jsonify({
                'product': {
                    'id': product['id'],
                    'name': product['name'],
                    'total_stock': product['total_stock'],
                    'seller_id': product['seller_id']
                },
                'stock_variants': [{
                    'size': variant['size'],
                    'color': variant['color'],
                    'color_name': variant['color_name'],
                    'stock_quantity': variant['stock_quantity'],
                    'price': float(variant['price']),
                    'discount_price': float(variant['discount_price']) if variant['discount_price'] else None
                } for variant in stock_variants],
                'recent_orders': [{
                    'order_number': order['order_number'],
                    'status': order['status'],
                    'quantity': order['quantity'],
                    'size': order['size'],
                    'color': order['color'],
                    'created_at': order['created_at'].isoformat() if order['created_at'] else None
                } for order in recent_orders],
                'total_variants': len(stock_variants),
                'total_recent_orders': len(recent_orders)
            })
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        finally:
            cursor.close()
            connection.close()
    
    if current_user.get('role') != 'seller':
        return jsonify({'error': 'Only sellers can update stock'}), 403
    
    data = request.get_json() or {}
    size = data.get('size', '')
    old_color = data.get('old_color', data.get('color', ''))
    new_color = data.get('color', '')
    new_stock = data.get('stock_quantity')
    price = data.get('price')
    discount_price = data.get('discount_price')
    color_name = data.get('color_name')
    
    if new_stock is None or new_stock < 0:
        return jsonify({'error': 'Invalid stock quantity'}), 400
    if price is not None and price < 0:
        return jsonify({'error': 'Invalid price'}), 400
    if discount_price is not None and discount_price < 0:
        return jsonify({'error': 'Invalid discount price'}), 400
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = connection.cursor(dictionary=True)
    
    try:
        cursor.execute("SELECT seller_id FROM products WHERE id = %s", (product_id,))
        product = cursor.fetchone()
        if not product or product['seller_id'] != current_user['id']:
            return jsonify({'error': 'You can only update your own products'}), 403
        
        update_fields = ['stock_quantity = %s']
        update_values = [new_stock]
        if price is not None:
            update_fields.append('price = %s')
            update_values.append(price)
        if discount_price is not None:
            update_fields.append('discount_price = %s')
            update_values.append(discount_price)
        if new_color != old_color:
            update_fields.append('color = %s')
            update_values.append(new_color)
        if color_name is not None:
            update_fields.append('color_name = %s')
            update_values.append(color_name)
        
        update_values.extend([product_id, size, old_color])
        update_query = f"UPDATE product_size_stock SET {', '.join(update_fields)} WHERE product_id = %s AND size = %s AND color = %s"
        cursor.execute(update_query, update_values)

        # If not updated, try flexible matching for legacy color formats
        if cursor.rowcount == 0:
            def is_hex_color(val):
                try:
                    if not val:
                        return False
                    v = val.strip()
                    if v.startswith('#'):
                        v = v[1:]
                    return len(v) == 6 and all(c.lower() in '0123456789abcdef' for c in v)
                except Exception:
                    return False

            def normalize_hex(val):
                v = val.strip()
                v = v[1:] if v.startswith('#') else v
                return '#' + v.lower()

            candidates = []
            # Original
            if old_color:
                candidates.append(old_color)
            # Normalized hex with and without '#'
            if old_color and is_hex_color(old_color):
                nhex = normalize_hex(old_color)
                candidates.append(nhex)
                candidates.append(nhex[1:])
            # Case-insensitive variants
            if old_color and not is_hex_color(old_color):
                candidates.append(old_color.lower())
                candidates.append(old_color.upper())

            updated = False
            for cand in candidates:
                tmp_vals = update_values.copy()
                tmp_vals[-1] = cand
                cursor.execute(update_query, tmp_vals)
                if cursor.rowcount > 0:
                    updated = True
                    break

            # As a last resort, try matching by color_name
            if not updated and old_color:
                cursor.execute(
                    """
                    SELECT color FROM product_size_stock
                    WHERE product_id = %s AND size = %s AND color_name = %s
                    LIMIT 1
                    """,
                    (product_id, size, old_color)
                )
                row = cursor.fetchone()
                if row and row.get('color'):
                    tmp_vals = update_values.copy()
                    tmp_vals[-1] = row['color']
                    cursor.execute(update_query, tmp_vals)
                    if cursor.rowcount > 0:
                        updated = True

            if not updated:
                return jsonify({'error': 'Product variant not found'}), 404
        
        cursor.execute("""
            UPDATE products SET total_stock = (SELECT COALESCE(SUM(stock_quantity), 0) FROM product_size_stock WHERE product_id = %s) WHERE id = %s
        """, (product_id, product_id))
        connection.commit()
        
        # Trigger price drop alerts if a price decreased/hit target
        try:
            trigger_price_drop_alerts(product_id)
        except Exception:
            pass
        
        # NEW: Notify wishlist buyers on big discount (>=50%)
        try:
            # Re-fetch the updated variant's price and discount
            cursor.execute(
                """
                SELECT p.name AS product_name, p.image_url AS product_image,
                       p.id AS pid,
                       p.seller_id,
                       pss.price, pss.discount_price
                FROM products p
                JOIN product_size_stock pss ON p.id = pss.product_id
                WHERE p.id = %s AND pss.size = %s AND pss.color = %s
                LIMIT 1
                """,
                (product_id, size, new_color if new_color else old_color)
            )
            row = cursor.fetchone()
            if row and row.get('price') is not None and row.get('discount_price') is not None:
                try:
                    base = float(row['price'])
                    disc = float(row['discount_price'])
                    if base > 0 and disc < base:
                        pct = round((1 - (disc / base)) * 100)
                        if pct > 0:
                            # Pick an image: prefer variant image, fallback to product image
                            cursor.execute(
                                """
                                SELECT image_url FROM product_variant_images
                                WHERE product_id = %s AND color = %s
                                ORDER BY display_order ASC, id ASC
                                LIMIT 1
                                """,
                                (product_id, new_color if new_color else old_color)
                            )
                            img_row = cursor.fetchone()
                            image_url = (img_row and img_row.get('image_url')) or row.get('product_image')
                            # Notify all users who wishlisted this product
                            cursor.execute("SELECT user_id FROM wishlist WHERE product_id = %s", (product_id,))
                            watchers = cursor.fetchall() or []
                            for w in watchers:
                                try:
                                    create_notification(
                                        w['user_id'],
                                        'price_drop',
                                        f"Price drop! {row['product_name']} is now {pct}% off.",
                                        reference_id=product_id,
                                        image_url=image_url
                                    )
                                except Exception:
                                    pass
                            # Also notify users who have this product in their cart
                            cursor.execute(
                                """
                                SELECT DISTINCT user_id FROM cart
                                WHERE product_id = %s
                                """,
                                (product_id,)
                            )
                            cart_users = cursor.fetchall() or []
                            for cu in cart_users:
                                try:
                                    create_notification(
                                        cu['user_id'],
                                        'price_drop',
                                        f"An item in your cart is now {pct}% off: {row['product_name']}",
                                        reference_id=product_id,
                                        image_url=image_url
                                    )
                                except Exception:
                                    pass
                except Exception:
                    pass
        except Exception as _:
            pass
        
        return jsonify({
            'success': True,
            'message': 'Variant updated successfully',
            'product_id': product_id,
            'size': size
        })
    except Exception as e:
        connection.rollback()
        print(f"Error updating stock for product {product_id}: {str(e)}")
        print(f"Request data: {data}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/stock/bulk-update', methods=['POST'])
@token_required
def bulk_update_stock(current_user):
    """Bulk update stock for products (seller/admin only)"""
    if current_user.get('role') not in ['seller', 'admin']:
        return jsonify({'error': 'Only sellers and admins can update stock'}), 403
    
    data = request.get_json() or {}
    updates = data.get('updates', [])
    
    if not updates:
        return jsonify({'error': 'No updates provided'}), 400
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    results = []
    
    try:
        cursor.execute("START TRANSACTION")
        
        for update in updates:
            product_id = update.get('product_id')
            size = update.get('size', '')
            color = update.get('color', '')
            new_stock = update.get('stock_quantity')
            
            if not product_id or new_stock is None or new_stock < 0:
                results.append({
                    'product_id': product_id,
                    'success': False,
                    'error': 'Invalid product_id or stock_quantity'
                })
                continue
            
            # For sellers, verify they own the product
            if current_user.get('role') == 'seller':
                cursor.execute("""
                    SELECT seller_id FROM products WHERE id = %s
                """, (product_id,))
                product = cursor.fetchone()
                
                if not product or product['seller_id'] != current_user['id']:
                    results.append({
                        'product_id': product_id,
                        'success': False,
                        'error': 'You can only update your own products'
                    })
                    continue
            
            # Update stock
            cursor.execute("""
                UPDATE product_size_stock 
                SET stock_quantity = %s
                WHERE product_id = %s AND size = %s AND color = %s
            """, (new_stock, product_id, size, color))
            
            if cursor.rowcount == 0:
                results.append({
                    'product_id': product_id,
                    'size': size,
                    'color': color,
                    'success': False,
                    'error': 'Product variant not found'
                })
                continue
            
            # Update total stock
            cursor.execute("""
                UPDATE products 
                SET total_stock = (
                    SELECT COALESCE(SUM(stock_quantity), 0) 
                    FROM product_size_stock 
                    WHERE product_id = %s
                )
                WHERE id = %s
            """, (product_id, product_id))
            
            results.append({
                'product_id': product_id,
                'size': size,
                'color': color,
                'new_stock': new_stock,
                'success': True
            })
            
            print(f"[STOCK] Bulk updated product {product_id} ({size}/{color}) stock to {new_stock}")
        
        connection.commit()
        
        return jsonify({
            'success': True,
            'message': f'Processed {len(results)} stock updates',
            'results': results,
            'successful_updates': len([r for r in results if r['success']]),
            'failed_updates': len([r for r in results if not r['success']])
        })
        
    except Exception as e:
        connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/stock/reset-product/<int:product_id>', methods=['POST'])
@token_required
def reset_product_stock(current_user, product_id):
    """Reset all variants of a product to a specific stock level"""
    if current_user.get('role') not in ['seller', 'admin']:
        return jsonify({'error': 'Only sellers and admins can reset stock'}), 403
    
    data = request.get_json() or {}
    default_stock = data.get('default_stock', 10)
    
    if default_stock < 0:
        return jsonify({'error': 'Stock cannot be negative'}), 400
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # For sellers, verify they own the product
        if current_user.get('role') == 'seller':
            cursor.execute("""
                SELECT seller_id, name FROM products WHERE id = %s
            """, (product_id,))
            product = cursor.fetchone()
            
            if not product or product['seller_id'] != current_user['id']:
                return jsonify({'error': 'You can only reset stock for your own products'}), 403
        else:
            cursor.execute("""
                SELECT name FROM products WHERE id = %s
            """, (product_id,))
            product = cursor.fetchone()
            
            if not product:
                return jsonify({'error': 'Product not found'}), 404
        
        # Reset all variants to default stock
        cursor.execute("""
            UPDATE product_size_stock 
            SET stock_quantity = %s
            WHERE product_id = %s
        """, (default_stock, product_id))
        
        variants_updated = cursor.rowcount
        
        # Update total stock
        cursor.execute("""
            UPDATE products 
            SET total_stock = (
                SELECT COALESCE(SUM(stock_quantity), 0) 
                FROM product_size_stock 
                WHERE product_id = %s
            )
            WHERE id = %s
        """, (product_id, product_id))
        
        connection.commit()
        
        print(f"[STOCK] Reset {variants_updated} variants of product {product_id} ({product['name']}) to {default_stock} units each")
        
        return jsonify({
            'success': True,
            'message': f'Reset stock for {variants_updated} variants',
            'product_id': product_id,
            'product_name': product['name'],
            'variants_updated': variants_updated,
            'default_stock': default_stock
        })
        
    except Exception as e:
        connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/debug/deliveries', methods=['GET'])
@token_required
def debug_deliveries(current_user):
    """Debug endpoint to check delivery records"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get all deliveries with order info
        cursor.execute("""
            SELECT 
                d.id, d.status as delivery_status, d.rider_id,
                d.created_at as delivery_created,
                o.id as order_id, o.order_number, o.status as order_status,
                o.seller_id, o.created_at as order_created,
                u.name as rider_name
            FROM deliveries d
            LEFT JOIN orders o ON d.order_id = o.id
            LEFT JOIN users u ON d.rider_id = u.id
            ORDER BY d.created_at DESC
            LIMIT 20
        """)
        
        deliveries = cursor.fetchall()
        
        return jsonify({
            'success': True,
            'deliveries': [{
                'delivery_id': d['id'],
                'delivery_status': d['delivery_status'],
                'rider_id': d['rider_id'],
                'rider_name': d['rider_name'],
                'order_id': d['order_id'],
                'order_number': d['order_number'],
                'order_status': d['order_status'],
                'seller_id': d['seller_id'],
                'delivery_created': d['delivery_created'].isoformat() if d['delivery_created'] else None,
                'order_created': d['order_created'].isoformat() if d['order_created'] else None
            } for d in deliveries]
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/orders/<int:order_id>/debug', methods=['GET'])
@token_required
def debug_order_status(current_user, order_id):
    """Debug endpoint to check order status and valid transitions"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        cursor.execute("""
            SELECT o.id, o.order_number, o.status, o.buyer_id, o.payment_method,
                   o.created_at, o.total_amount
            FROM orders o
            WHERE o.id = %s
        """, (order_id,))
        order = cursor.fetchone()
        
        if not order:
            return jsonify({'error': 'Order not found'}), 404
        
        role = current_user.get('role')
        current_status = order['status']
        
        # Get valid next statuses
        valid_statuses = get_valid_next_statuses(current_status, role)
        
        # Check if cancellation is valid
        is_cancel_valid, cancel_error = validate_status_transition(current_status, 'cancelled', role)
        
        return jsonify({
            'order': {
                'id': order['id'],
                'order_number': order['order_number'],
                'status': current_status,
                'payment_method': order['payment_method'],
                'total_amount': float(order['total_amount']),
                'created_at': order['created_at'].isoformat() if order['created_at'] else None
            },
            'user': {
                'role': role,
                'id': current_user.get('id')
            },
            'validation': {
                'valid_next_statuses': valid_statuses,
                'can_cancel': is_cancel_valid,
                'cancel_error': cancel_error
            }
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/orders/<int:order_id>/request-rider', methods=['POST'])
@token_required
def request_rider_assignment(current_user, order_id):
    """Request rider assignment for an order (seller only)"""
    if current_user.get('role') != 'seller':
        return jsonify({'error': 'Only sellers can request rider assignment'}), 403
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get order details
        cursor.execute("""
            SELECT o.id, o.order_number, o.status, o.seller_id
            FROM orders o
            WHERE o.id = %s
        """, (order_id,))
        
        order = cursor.fetchone()
        if not order:
            return jsonify({'error': 'Order not found'}), 404
        
        # Verify seller owns this order
        if order['seller_id'] != current_user['id']:
            return jsonify({'error': 'You can only request riders for your own orders'}), 403
        
        # Check if order is in correct status for rider assignment
        if order['status'] not in ['prepared', 'confirmed']:
            return jsonify({'error': f'Orders must be prepared before requesting rider assignment. Current status: {order["status"]}'}), 400
        
        # Check if delivery record exists, create if not
        cursor.execute("SELECT id FROM deliveries WHERE order_id = %s", (order_id,))
        existing_delivery = cursor.fetchone()
        
        if not existing_delivery:
            # Create delivery record if it doesn't exist
            delivery_created = create_delivery_from_order(order_id, order)
            if not delivery_created:
                return jsonify({'error': 'Failed to create delivery record'}), 500
        
        riders_notified = notify_available_riders_of_delivery(order_id, order['order_number'])
        
        return jsonify({
            'success': True,
            'message': f'Notified {riders_notified} rider(s) that order {order["order_number"]} is ready for pickup.',
            'rider_assigned': False,
            'status': 'awaiting_rider_acceptance',
            'riders_notified': riders_notified
        })
        
    except Exception as e:
        print(f"Error requesting rider assignment: {str(e)}")
        return jsonify({'error': f'Failed to request rider assignment: {str(e)}'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/orders/<int:order_id>/status', methods=['PUT'])
@token_required
def update_order_status(current_user, order_id):
    """Update order status with validation and automatic buyer notifications"""
    data = request.get_json() or {}
    new_status = data.get('status')
    cancel_reason = data.get('cancel_reason')

    # Validate status
    allowed_statuses = ['pending', 'confirmed', 'prepared', 'shipped', 'delivered', 'cancelled']
    if new_status not in allowed_statuses:
        return jsonify({'error': 'Invalid status'}), 400

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = connection.cursor(dictionary=True)

    try:
        riders_notified = 0
        should_notify_riders = False
        # Get order details with proper product image retrieval
        cursor.execute("""
            SELECT o.id, o.order_number, o.status, o.buyer_id, o.full_name as buyer_name,
                   o.email as buyer_email,
                   CONCAT(o.address, ', ', o.city, ' ', o.postal_code, ', ', o.country) as shipping_address,
                   COALESCE(o.tracking_number, '') as tracking_number
            FROM orders o
            WHERE o.id = %s
        """, (order_id,))
        order = cursor.fetchone()

        if not order:
            return jsonify({'error': 'Order not found'}), 404

        role = current_user.get('role')
        current_status = order['status']

        # VALIDATE STATUS TRANSITION
        print(f"[DEBUG] Validating status transition: {current_status} -> {new_status} for role {role}")
        is_valid, error_msg = validate_status_transition(current_status, new_status, role)
        print(f"[DEBUG] Validation result: is_valid={is_valid}, error_msg={error_msg}")
        if not is_valid:
            return jsonify({'error': error_msg}), 400

        # Authorization checks based on user role
        if role == 'seller':
            # Verify seller owns products in this order
            print(f"[DEBUG] Checking if seller {current_user['id']} owns products in order {order_id}")
            cursor.execute("""
                SELECT COUNT(*) as cnt
                FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = %s AND p.seller_id = %s
            """, (order_id, current_user['id']))
            cnt = cursor.fetchone()['cnt']
            print(f"[DEBUG] Seller owns {cnt} products in this order")

            if cnt == 0:
                # Fallback: allow if orders.seller_id matches current seller
                cursor.execute("SELECT seller_id FROM orders WHERE id = %s", (order_id,))
                owner_row = cursor.fetchone()
                if not owner_row or owner_row.get('seller_id') != current_user['id']:
                    return jsonify({'error': 'You cannot modify this order'}), 403

            # When seller confirms order, deduct stock and ensure we have a delivery record
            if new_status == 'confirmed' and current_status != 'confirmed':
                # Deduct stock when seller confirms the order
                print(f"[STOCK] Seller confirming order {order['order_number']} - deducting stock")
                try:
                    # Get all order items to deduct stock
                    cursor.execute("""
                        SELECT product_id, quantity, size, color, product_name
                        FROM order_items
                        WHERE order_id = %s
                    """, (order_id,))
                    order_items = cursor.fetchall()

                    if order_items:
                        # Deduct stock for each item
                        for item in order_items:
                            product_id = item['product_id']
                            quantity = item['quantity']
                            size = item['size'] or ''
                            color = item['color'] or ''
                            
                            # Check current stock
                            cursor.execute("""
                                SELECT stock_quantity FROM product_size_stock 
                                WHERE product_id = %s AND size = %s AND color = %s
                            """, (product_id, size, color))
                            stock_result = cursor.fetchone()
                            
                            if not stock_result:
                                # Try to find any available variant
                                cursor.execute("""
                                    SELECT size, color, stock_quantity 
                                    FROM product_size_stock 
                                    WHERE product_id = %s AND stock_quantity >= %s
                                    ORDER BY stock_quantity DESC
                                    LIMIT 1
                                """, (product_id, quantity))
                                fallback = cursor.fetchone()
                                if fallback:
                                    size = fallback['size'] or ''
                                    color = fallback['color'] or ''
                                    stock_result = {'stock_quantity': fallback['stock_quantity']}
                            
                            if not stock_result or stock_result['stock_quantity'] < quantity:
                                raise ValueError(f"Insufficient stock for {item['product_name']}. Available: {stock_result['stock_quantity'] if stock_result else 0}, Required: {quantity}")
                            
                            # Deduct stock
                            cursor.execute("""
                                UPDATE product_size_stock
                                SET stock_quantity = stock_quantity - %s
                                WHERE product_id = %s AND size = %s AND color = %s
                            """, (quantity, product_id, size, color))
                            print(f"[STOCK] Deducted {quantity} units from product {product_id} ({size}/{color}) - Order {order['order_number']}")
                            
                            # Update order item with actual variant used if it changed
                            if size != (item['size'] or '') or color != (item['color'] or ''):
                                cursor.execute("""
                                    UPDATE order_items 
                                    SET size = %s, color = %s
                                    WHERE order_id = %s AND product_id = %s
                                """, (size, color, order_id, product_id))

                        # Update total stock in products table for all affected products
                        unique_products = set(item['product_id'] for item in order_items)
                        for product_id in unique_products:
                            cursor.execute("""
                                UPDATE products
                                SET total_stock = (
                                    SELECT COALESCE(SUM(stock_quantity), 0)
                                    FROM product_size_stock
                                    WHERE product_id = %s
                                )
                                WHERE id = %s
                            """, (product_id, product_id))
                        
                        print(f"[STOCK] Successfully deducted stock for confirmed order {order['order_number']}")
                except Exception as e:
                    # Fail the status update if stock deduction fails
                    connection.rollback()
                    error_msg = f"Failed to deduct stock: {str(e)}"
                    print(f"[STOCK] ERROR: {error_msg}")
                    return jsonify({'error': error_msg}), 400
                
                # Create delivery record for rider assignment
                try:
                    cursor.execute("SELECT id FROM deliveries WHERE order_id = %s", (order_id,))
                    existing_delivery = cursor.fetchone()

                    if not existing_delivery:
                        # Delegate to shared helper so that delivery_fee/base_fee
                        # are always consistent with the order's delivery_fee.
                        create_delivery_from_order(order_id, order)

                        print(f"[DELIVERY] Created delivery record for confirmed order {order['order_number']}")
                except Exception as e:
                    # Do not fail the whole status update if delivery creation fails; log and continue
                    print(f"[DELIVERY] Non-fatal error creating delivery for order {order['order_number']}: {e}")

            # When seller sets to "shipped", create/update tracking number
            elif new_status == 'shipped':
                try:
                    tracking_number = order.get('tracking_number')
                    if not tracking_number:
                        import random
                        import string
                        tracking_number = 'BF' + ''.join(random.choices(string.digits, k=10))

                        cursor.execute("""
                            UPDATE orders SET tracking_number = %s WHERE id = %s
                        """, (tracking_number, order_id))

                    # Update delivery status to ready for pickup if exists
                    cursor.execute("""
                        UPDATE deliveries SET status = 'pending'
                        WHERE order_id = %s AND status != 'assigned'
                    """, (order_id,))
                except Exception as e:
                    print(f"[ORDER] Non-fatal tracking update error for order {order['order_number']}: {e}")

        elif role == 'buyer':
            if order.get('buyer_id') != current_user.get('id'):
                return jsonify({'error': 'You cannot modify this order'}), 403

        elif role == 'rider':
            # Additional rider-specific checks can go here
            pass
        else:
            return jsonify({'error': 'Unauthorized'}), 403

        # Get product image for notifications
        product_image = None
        try:
            cursor.execute("""
                SELECT (
                    SELECT pvi2.image_url
                    FROM product_variant_images pvi2
                    WHERE pvi2.product_id = oi.product_id
                    AND (pvi2.color = oi.color OR pvi2.color IS NULL)
                    ORDER BY CASE WHEN pvi2.color = oi.color THEN 0 ELSE 1 END, pvi2.display_order ASC
                    LIMIT 1
                ) as image_url
                FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                LEFT JOIN product_size_stock pss ON (
                    p.id = pss.product_id
                    AND oi.size = pss.size
                    AND oi.color = pss.color
                )
                WHERE oi.order_id = %s
                LIMIT 1
            """, (order_id,))
            image_result = cursor.fetchone()
            if image_result and image_result['image_url']:
                product_image = image_result['image_url']
        except Exception as img_error:
            print(f"Error fetching product image: {str(img_error)}")
            pass

        # If cancelling, ensure orders.cancel_reason column exists and store reason
        if new_status == 'cancelled' and current_status != 'cancelled':
            # Try to add column if missing (first-run migration)
            try:
                cursor.execute("ALTER TABLE orders ADD COLUMN cancel_reason TEXT NULL")
                print("[MIGRATION] Added orders.cancel_reason column")
            except Exception as mig_err:
                pass
            if cancel_reason:
                try:
                    cursor.execute("UPDATE orders SET cancel_reason = %s WHERE id = %s", (cancel_reason, order_id))
                except Exception as e:
                    print(f"[ORDER] Failed updating cancel_reason: {e}")

        # Handle stock restoration for cancelled orders
        # Only restore stock if order was previously confirmed (stock was already deducted)
        if new_status == 'cancelled' and current_status != 'cancelled':
            # Check if order was previously confirmed (stock was deducted)
            was_confirmed = current_status in ['confirmed', 'prepared', 'shipped', 'delivered']
            
            if was_confirmed:
                print(f"[ORDER] Order {order['order_number']} is being cancelled - restoring stock (order was previously confirmed)")
                try:
                    # Get all order items to restore stock
                    cursor.execute("""
                        SELECT product_id, quantity, size, color, product_name
                        FROM order_items
                        WHERE order_id = %s
                    """, (order_id,))
                    order_items = cursor.fetchall()

                    if order_items:
                        # Restore stock for each item
                        for item in order_items:
                            cursor.execute("""
                                UPDATE product_size_stock
                                SET stock_quantity = stock_quantity + %s
                                WHERE product_id = %s AND size = %s AND color = %s
                            """, (
                                item['quantity'],
                                item['product_id'],
                                item['size'] or '',
                                item['color'] or ''
                            ))
                            print(f"[STOCK] Restored {item['quantity']} units to product {item['product_id']} ({item['size']}/{item['color']}) - Order {order['order_number']}")

                        # Update total stock in products table for all affected products
                        unique_products = set(item['product_id'] for item in order_items)
                        for product_id in unique_products:
                            cursor.execute("""
                                UPDATE products
                                SET total_stock = (
                                    SELECT COALESCE(SUM(stock_quantity), 0)
                                    FROM product_size_stock
                                    WHERE product_id = %s
                                )
                                WHERE id = %s
                            """, (product_id, product_id))
                        print(f"[STOCK] Successfully restored stock for cancelled order {order['order_number']}")
                except Exception as e:
                    # Log but do not fail the status update; seller action should proceed
                    print(f"[STOCK] Non-fatal error restoring stock for order {order_id}: {str(e)}")
            else:
                print(f"[ORDER] Order {order['order_number']} is being cancelled - no stock to restore (order was never confirmed)")

        # Update the order status
        cursor.execute("""
            UPDATE orders
            SET status = %s, updated_at = NOW()
            WHERE id = %s
        """, (new_status, order_id))

        # Insert status history record if changed
        if current_status != new_status:
            try:
                cursor.execute("INSERT INTO order_status_history (order_id, status) VALUES (%s, %s)", (order_id, new_status))
            except Exception as e:
                print(f"[HISTORY] Failed to record status history: {e}")

        # When order is marked prepared, notify riders instead of auto-assign
        if new_status == 'prepared' and current_status != 'prepared':
            print(f"[RIDER_NOTIFY] Order {order['order_number']} ready for pickup - notifying riders")
            should_notify_riders = True
            try:
                cursor.execute("SELECT id FROM deliveries WHERE order_id = %s", (order_id,))
                if not cursor.fetchone():
                    create_delivery_from_order(order_id, order)
            except Exception as e:
                print(f"[RIDER_NOTIFY] Unable to ensure delivery record for order {order['order_number']}: {e}")

        notification_sent = False
        tracking_number = order.get('tracking_number')

        # Create notification for buyer only if status actually changed
        if current_status != new_status and order['buyer_id']:
            notification_type = f'order_{new_status}'
            message = get_status_message(new_status, order['order_number'])

            # Add tracking number to shipped notification
            if new_status == 'shipped' and tracking_number:
                message = f"Your order #{order['order_number']} has been shipped! Tracking number: {tracking_number}"

            try:
                cursor.execute("""
                    INSERT INTO notifications (user_id, type, message, reference_id, image_url, created_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                """, (
                    order['buyer_id'],
                    notification_type,
                    message,
                    order_id,
                    product_image
                ))
                notification_sent = True
                print(f"Notification created for user {order['buyer_id']}: {message}")
            except Exception as e:
                print(f"Error creating notification: {str(e)}")

        connection.commit()
        
        if should_notify_riders:
            try:
                riders_notified = notify_available_riders_of_delivery(order_id, order['order_number'], product_image)
            except Exception as e:
                print(f"[RIDER_NOTIFY] Error while notifying riders: {e}")

        return jsonify({
            'success': True,
            'message': f'Order status updated to {new_status}',
            'order_id': order_id,
            'status': new_status,
            'order_number': order['order_number'],
            'notification_sent': notification_sent,
            'tracking_number': tracking_number if new_status == 'shipped' else order.get('tracking_number'),
            'valid_next_statuses': get_valid_next_statuses(new_status, role),
            'riders_notified': riders_notified
        })

    except Exception as e:
        connection.rollback()
        print(f"Error updating order status: {str(e)}")
        return jsonify({'error': 'Failed to update status', 'detail': str(e)}), 500

    finally:
        cursor.close()
        connection.close()

@app.route('/api/notifications', methods=['GET'])
def get_notifications():
    """Get notifications for the current user - handle both authenticated and unauthenticated cases"""
    
    # Check for authorization header
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        # Return empty notifications for unauthenticated users
        return jsonify({
            'success': True,
            'notifications': [],
            'unread_count': 0,
            'total': 0,
            'message': 'No authentication token provided'
        })
    
    # Extract token
    try:
        token = auth_header.split(" ")[1]
        if not token or token.lower() == 'null':
            return jsonify({
                'success': True,
                'notifications': [],
                'unread_count': 0,
                'total': 0
            })
    except IndexError:
        return jsonify({
            'success': True,
            'notifications': [],
            'unread_count': 0,
            'total': 0
        })
    
    # Try to decode token and get user
    try:
        data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
        user_id = data.get('user_id')
        
        if not user_id:
            return jsonify({
                'success': True,
                'notifications': [],
                'unread_count': 0,
                'total': 0
            })
            
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = connection.cursor(dictionary=True)
        
        # Get notifications with product image for visualization
        cursor.execute("""
            SELECT 
                n.id,
                n.type,
                n.message,
                n.image_url,
                n.reference_id,
                n.is_read,
                n.created_at,
                CASE 
                    WHEN o.id IS NOT NULL THEN (
                        SELECT pvi.image_url FROM product_variant_images pvi
                        WHERE pvi.product_id = p.id
                        ORDER BY pvi.display_order ASC
                        LIMIT 1
                    )
                    ELSE NULL
                END as product_image
            FROM notifications n
            LEFT JOIN orders o ON n.reference_id = o.id AND n.type LIKE 'order_%'
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE n.user_id = %s
            ORDER BY n.created_at DESC
            LIMIT 20
        """, (user_id,))
        
        notifications = cursor.fetchall()
        
        # Get unread count
        cursor.execute("""
            SELECT COUNT(*) as unread_count 
            FROM notifications 
            WHERE user_id = %s AND is_read = FALSE
        """, (user_id,))
        
        unread_count = cursor.fetchone()['unread_count']
        
        # Format notifications
        formatted_notifications = []
        for notif in notifications:
            formatted_notifications.append({
                'id': notif['id'],
                'type': notif['type'],
                'message': notif['message'],
                'image_url': notif['image_url'] or notif['product_image'],
                'reference_id': notif['reference_id'],
                'is_read': bool(notif['is_read']),
                'created_at': notif['created_at'].isoformat() if notif['created_at'] else None,
                'time_ago': get_time_ago(notif['created_at']) if notif['created_at'] else 'Unknown'
            })
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'notifications': formatted_notifications,
            'unread_count': unread_count,
            'total': len(formatted_notifications)
        })
        
    except jwt.ExpiredSignatureError:
        return jsonify({
            'success': True,
            'notifications': [],
            'unread_count': 0,
            'total': 0,
            'message': 'Token expired'
        })
    except jwt.InvalidTokenError:
        return jsonify({
            'success': True,
            'notifications': [],
            'unread_count': 0,
            'total': 0,
            'message': 'Invalid token'
        })
    except Exception as e:
        print(f"Error fetching notifications: {str(e)}")
        return jsonify({
            'success': True,
            'notifications': [],
            'unread_count': 0,
            'total': 0,
            'error': 'Failed to fetch notifications'
        })

@app.route('/api/notifications/stream', methods=['GET'])
def stream_notifications():
    """Server-Sent Events endpoint for real-time notifications"""
    
    # Accept Bearer token from header or token query param for EventSource compatibility
    auth_header = request.headers.get('Authorization')
    token = None
    if auth_header and auth_header.startswith('Bearer '):
        try:
            token = auth_header.split(" ", 1)[1]
        except Exception:
            token = None
    if not token:
        token = request.args.get('token')
    if not token or token.lower() == 'null':
        return jsonify({'error': 'Authentication required'}), 401
    
    try:
        data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
        user_id = data.get('user_id')
        if not user_id:
            return jsonify({'error': 'Invalid token'}), 401
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return jsonify({'error': 'Invalid or expired token'}), 401
    
    # Capture request args BEFORE streaming starts to avoid context leaks
    try:
        last_id = int(request.args.get('lastId', 0))
    except Exception:
        last_id = 0
    
    def generate():
        """Generator function for SSE stream"""
        nonlocal last_id
        
        # Send initial connection event
        yield f"data: {{\"type\": \"connected\", \"message\": \"Stream connected\"}}\n\n"
        
        while True:
            try:
                connection = get_db_connection()
                if not connection:
                    yield f"data: {{\"type\": \"error\", \"message\": \"Database connection failed\"}}\n\n"
                    time.sleep(5)
                    continue
                
                cursor = connection.cursor(dictionary=True)
                
                # Query for new notifications
                cursor.execute("""
                    SELECT 
                        n.id,
                        n.type,
                        n.message,
                        n.image_url,
                        n.reference_id,
                        n.is_read,
                        n.created_at
                    FROM notifications n
                    WHERE n.user_id = %s AND n.id > %s
                    ORDER BY n.created_at DESC
                    LIMIT 10
                """, (user_id, last_id))
                
                new_notifications = cursor.fetchall()
                
                # Send new notifications
                for notif in new_notifications:
                    notification_data = {
                        'id': notif['id'],
                        'type': notif['type'],
                        'message': notif['message'],
                        'image_url': notif['image_url'],
                        'reference_id': notif['reference_id'],
                        'is_read': bool(notif['is_read']),
                        'created_at': notif['created_at'].isoformat() if notif['created_at'] else None
                    }
                    yield f"data: {json.dumps(notification_data)}\n\n"
                    last_id = max(last_id, notif['id'])
                
                # Send heartbeat to keep connection alive
                yield f": heartbeat\n\n"
                
                cursor.close()
                connection.close()
                
                # Poll every 3 seconds
                time.sleep(3)
                
            except GeneratorExit:
                # Client disconnected
                break
            except Exception as e:
                print(f"[SSE] Error: {str(e)}")
                yield f"data: {{\"type\": \"error\", \"message\": \"Stream error\"}}\n\n"
                time.sleep(5)
    
    response = app.response_class(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive'
        }
    )
    return response

# Mark notification as read
@app.route('/api/notifications/<int:notification_id>/read', methods=['PUT'])
@token_required
def mark_notification_read(current_user, notification_id):
    """Mark a notification as read"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor()
    
    try:
        cursor.execute("""
            UPDATE notifications 
            SET is_read = TRUE 
            WHERE id = %s AND user_id = %s
        """, (notification_id, current_user['id']))
        
        if cursor.rowcount == 0:
            return jsonify({'error': 'Notification not found'}), 404
        
        connection.commit()
        
        return jsonify({
            'success': True,
            'message': 'Notification marked as read'
        })
        
    except Exception as e:
        connection.rollback()
        print(f"Error marking notification as read: {str(e)}")
        return jsonify({'error': 'Failed to update notification'}), 500
    finally:
        cursor.close()
        connection.close()

# Mark all notifications as read
@app.route('/api/notifications/read-all', methods=['PUT'])
@token_required
def mark_all_notifications_read(current_user):
    """Mark all notifications as read for the current user"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor()
    
    try:
        cursor.execute("""
            UPDATE notifications 
            SET is_read = TRUE 
            WHERE user_id = %s AND is_read = FALSE
        """, (current_user['id'],))
        
        updated_count = cursor.rowcount
        connection.commit()
        
        return jsonify({
            'success': True,
            'message': f'Marked {updated_count} notifications as read'
        })
        
    except Exception as e:
        connection.rollback()
        print(f"Error marking all notifications as read: {str(e)}")
        return jsonify({'error': 'Failed to update notifications'}), 500
    finally:
        cursor.close()
        connection.close()

# Delete notification
@app.route('/api/notifications/<int:notification_id>', methods=['DELETE'])
@token_required
def delete_notification(current_user, notification_id):
    """Delete a notification"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor()
    
    try:
        cursor.execute("""
            DELETE FROM notifications 
            WHERE id = %s AND user_id = %s
        """, (notification_id, current_user['id']))
        
        if cursor.rowcount == 0:
            return jsonify({'error': 'Notification not found'}), 404
        
        connection.commit()
        
        return jsonify({
            'success': True,
            'message': 'Notification deleted'
        })
        
    except Exception as e:
        connection.rollback()
        print(f"Error deleting notification: {str(e)}")
        return jsonify({'error': 'Failed to delete notification'}), 500
    finally:
        cursor.close()
        connection.close()

# Get notification count
@app.route('/api/notifications/count', methods=['GET'])
@token_required
def get_notification_count(current_user):
    """Get notification counts for the current user"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get unread count
        cursor.execute("""
            SELECT COUNT(*) as unread_count 
            FROM notifications 
            WHERE user_id = %s AND is_read = FALSE
        """, (current_user['id'],))
        
        unread_count = cursor.fetchone()['unread_count']
        
        # Get total count
        cursor.execute("""
            SELECT COUNT(*) as total_count 
            FROM notifications 
            WHERE user_id = %s
        """, (current_user['id'],))
        
        total_count = cursor.fetchone()['total_count']
        
        return jsonify({
            'success': True,
            'unread_count': unread_count,
            'total_count': total_count
        })
        
    except Exception as e:
        print(f"Error getting notification count: {str(e)}")
        return jsonify({'error': 'Failed to get notification count'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/rider/dashboard', methods=['GET'])
@token_required
@rider_required
def get_rider_dashboard(current_user):
    """Get rider dashboard statistics and recent activity"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        rider_id = current_user['id']
        
        # Get today's stats
        cursor.execute("""
            SELECT 
                COUNT(*) as today_deliveries,
                COALESCE(SUM(base_fee + distance_bonus + tips + peak_bonus), 0) as today_earnings
            FROM deliveries 
            WHERE rider_id = %s 
            AND DATE(completed_at) = CURDATE()
            AND status = 'delivered'
        """, (rider_id,))
        today_stats = cursor.fetchone()
        
        # Get active deliveries
        cursor.execute("""
            SELECT COUNT(*) as active_count
            FROM deliveries 
            WHERE rider_id = %s 
            AND status IN ('assigned', 'picked_up', 'in_transit')
        """, (rider_id,))
        active_stats = cursor.fetchone()
        
        # Get available deliveries count
        cursor.execute("""
            SELECT COUNT(*) as available_count
            FROM deliveries 
            WHERE rider_id IS NULL 
            AND status = 'pending'
        """, ())
        available_stats = cursor.fetchone()
        
        # Get week's stats
        cursor.execute("""
            SELECT 
                COUNT(*) as week_deliveries,
                COALESCE(SUM(base_fee + distance_bonus + tips + peak_bonus), 0) as week_earnings
            FROM deliveries 
            WHERE rider_id = %s 
            AND WEEK(completed_at) = WEEK(CURDATE())
            AND YEAR(completed_at) = YEAR(CURDATE())
            AND status = 'delivered'
        """, (rider_id,))
        week_stats = cursor.fetchone()
        
        # Get recent activity
        cursor.execute("""
            SELECT 
                d.id,
                d.status,
                d.delivery_address,
                d.created_at,
                d.completed_at,
                o.order_number,
                o.total_amount
            FROM deliveries d
            LEFT JOIN orders o ON d.order_id = o.id
            WHERE d.rider_id = %s 
            ORDER BY d.created_at DESC
            LIMIT 10
        """, (rider_id,))
        recent_activity = cursor.fetchall()
        
        # Get average rating
        cursor.execute("""
            SELECT AVG(rating) as avg_rating
            FROM delivery_ratings
            WHERE rider_id = %s
        """, (rider_id,))
        rating_stats = cursor.fetchone()
        
        return jsonify({
            'success': True,
            'stats': {
                'today_deliveries': today_stats['today_deliveries'] or 0,
                'today_earnings': float(today_stats['today_earnings'] or 0),
                'active_deliveries': active_stats['active_count'] or 0,
                'available_orders': available_stats['available_count'] or 0,
                'week_deliveries': week_stats['week_deliveries'] or 0,
                'week_earnings': float(week_stats['week_earnings'] or 0),
                'average_rating': float(rating_stats['avg_rating'] or 0)
            },
            'recent_activity': [
                {
                    'id': activity['id'],
                    'order_number': activity['order_number'],
                    'status': activity['status'],
                    'address': activity['delivery_address'],
                    'amount': float(activity['total_amount']) if activity['total_amount'] else 0,
                    'created_at': activity['created_at'].isoformat() if activity['created_at'] else None,
                    'completed_at': activity['completed_at'].isoformat() if activity['completed_at'] else None
                } for activity in recent_activity
            ]
        })
        
    except Exception as e:
        print(f"Error getting rider dashboard: {str(e)}")
        return jsonify({'error': 'Failed to get dashboard data'}), 500
    finally:
        cursor.close()
        connection.close()

# Get available deliveries
@app.route('/api/rider/deliveries/available', methods=['GET'])
@token_required
@rider_required
def get_available_deliveries(current_user):
    """Get available deliveries for riders to accept"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        cursor.execute("""
            SELECT 
                d.*,
                o.order_number,
                o.full_name as customer_name,
                o.email as customer_email,
                o.address as order_delivery_address,
                o.city as order_city,
                o.total_amount,
                u.name as customer_name_alt,
                u.phone as customer_phone,
                -- seller (shop) full address from user_addresses table (same as buyer)
                (
                  SELECT CONCAT_WS(', ',
                    NULLIF(sa.street, ''),
                    NULLIF(sa.barangay, ''),
                    NULLIF(sa.city, ''),
                    NULLIF(sa.province, ''),
                    NULLIF(sa.region, '')
                  )
                  FROM user_addresses sa 
                  WHERE sa.user_id = o.seller_id 
                  ORDER BY sa.is_default DESC, sa.updated_at DESC 
                  LIMIT 1
                ) as seller_address,
                s.name as seller_name,
                s.phone as seller_phone,
                -- buyer complete address from user_addresses
                (
                  SELECT CONCAT_WS(', ',
                    NULLIF(ua.street, ''),
                    NULLIF(ua.barangay, ''),
                    NULLIF(ua.city, ''),
                    NULLIF(ua.province, ''),
                    NULLIF(ua.region, '')
                  )
                  FROM user_addresses ua 
                  WHERE ua.user_id = o.buyer_id 
                  ORDER BY ua.is_default DESC, ua.updated_at DESC 
                  LIMIT 1
                ) as buyer_full_address,
                (
                  SELECT ua.barangay FROM user_addresses ua 
                  WHERE ua.user_id = o.buyer_id 
                  ORDER BY ua.is_default DESC, ua.updated_at DESC 
                  LIMIT 1
                ) as buyer_barangay,
                -- coords only for internal distance computation (not returned)
                (
                  SELECT ua.latitude FROM user_addresses ua 
                  WHERE ua.user_id = o.buyer_id 
                  ORDER BY ua.is_default DESC, ua.updated_at DESC 
                  LIMIT 1
                ) as buyer_latitude,
                (
                  SELECT ua.longitude FROM user_addresses ua 
                  WHERE ua.user_id = o.buyer_id 
                  ORDER BY ua.is_default DESC, ua.updated_at DESC 
                  LIMIT 1
                ) as buyer_longitude,
                s.location_lat as seller_latitude,
                s.location_lng as seller_longitude
            FROM deliveries d
            LEFT JOIN orders o ON d.order_id = o.id
            LEFT JOIN users u ON o.buyer_id = u.id
            LEFT JOIN users s ON o.seller_id = s.id
            WHERE d.rider_id IS NULL 
            AND d.status = 'pending'
            ORDER BY d.created_at ASC
        """)
        
        deliveries = cursor.fetchall()
        
        def _round_km(x):
            try:
                return round(float(x) * 2) / 2.0
            except Exception:
                return None
        
        import math
        def _haversine_km(lat1, lon1, lat2, lon2):
            try:
                R = 6371.0
                phi1, phi2 = math.radians(lat1), math.radians(lat2)
                dphi = math.radians(lat2 - lat1)
                dl = math.radians(lon2 - lon1)
                a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dl/2)**2
                c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                return R * c
            except Exception:
                return None
        
        formatted_deliveries = []
        for delivery in deliveries:
            # compute approximate distance
            approx_km = None
            if delivery.get('distance'):
                approx_km = _round_km(delivery['distance'])
            if not approx_km and delivery.get('buyer_latitude') is not None and delivery.get('buyer_longitude') is not None \
               and delivery.get('seller_latitude') is not None and delivery.get('seller_longitude') is not None:
                dkm = _haversine_km(float(delivery['seller_latitude']), float(delivery['seller_longitude']),
                                    float(delivery['buyer_latitude']), float(delivery['buyer_longitude']))
                approx_km = _round_km(dkm) if dkm is not None else None
            
            # area text
            barangay = delivery.get('buyer_barangay')
            city = delivery.get('order_city')
            area_text = ", ".join([p for p in [barangay, city] if p]) if (barangay or city) else None
            
            # pick up by suggestion
            priority = delivery.get('priority') or 'normal'
            minutes_map = { 'urgent': 10, 'high': 15, 'normal': 30, 'low': 45 }
            add_min = minutes_map.get(priority, 30)
            pick_up_by = None
            try:
                if delivery.get('created_at'):
                    pick_up_by = (delivery['created_at'] + timedelta(minutes=add_min)).isoformat()
            except Exception:
                pick_up_by = None
            
            # Get complete addresses
            seller_address = delivery.get('seller_address') or 'Seller shop address not available'
            buyer_delivery_address = delivery.get('buyer_full_address') or area_text or (delivery.get('order_city') or 'Unknown Area')
            
            formatted_deliveries.append({
                'id': delivery['id'],
                'order_number': delivery['order_number'],
                'customer_name': delivery['customer_name'] or delivery['customer_name_alt'] or 'Unknown',
                'customer_phone': delivery['customer_phone'] or 'N/A',
                'customer_email': delivery['customer_email'] or 'N/A',
                'seller_name': delivery.get('seller_name') or 'Seller',
                'seller_phone': delivery.get('seller_phone') or 'N/A',
                'seller_address': seller_address,
                'pickup_address': seller_address,
                'buyer_address': buyer_delivery_address,
                'delivery_address': buyer_delivery_address,
                'approx_distance_km': approx_km if approx_km is not None else 0,
                'delivery_fee': float(delivery['delivery_fee']),
                'base_fee': float(delivery['base_fee']),
                'estimated_time': delivery['estimated_time'],
                'delivery_type': delivery['delivery_type'],
                'priority': priority,
                'pick_up_by': pick_up_by,
                'order_total': float(delivery['total_amount']) if delivery['total_amount'] else 0,
                'created_at': delivery['created_at'].isoformat() if delivery['created_at'] else None
            })
        
        return jsonify({
            'success': True,
            'deliveries': formatted_deliveries,
            'total': len(formatted_deliveries)
        })
        
    except Exception as e:
        print(f"Error getting available deliveries: {str(e)}")
        return jsonify({'error': 'Failed to get available deliveries'}), 500
    finally:
        cursor.close()
        connection.close()

# Get rider's active deliveries
@app.route('/api/rider/deliveries', methods=['GET'])
@token_required
@rider_required
def get_rider_deliveries(current_user):
    """Get rider's current active deliveries"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        rider_id = current_user['id']
        status_filter = request.args.get('status')  # assigned, picked_up, in_transit
        
        base_query = """
            SELECT 
                d.*,
                o.order_number,
                o.full_name as customer_name,
                o.email as customer_email,
                CONCAT(o.address, ', ', o.city, ' ', o.postal_code, ', ', o.country) as order_delivery_address,
                o.total_amount,
                u.name as customer_name_alt,
                u.phone as customer_phone,
                -- seller (shop) full address from user_addresses table
                (
                  SELECT CONCAT_WS(', ',
                    NULLIF(sa.street, ''),
                    NULLIF(sa.barangay, ''),
                    NULLIF(sa.city, ''),
                    NULLIF(sa.province, ''),
                    NULLIF(sa.region, '')
                  )
                  FROM user_addresses sa 
                  WHERE sa.user_id = o.seller_id 
                  ORDER BY sa.is_default DESC, sa.updated_at DESC 
                  LIMIT 1
                ) as seller_full_address,
                -- buyer complete address from user_addresses
                (
                  SELECT CONCAT_WS(', ',
                    NULLIF(ua.street, ''),
                    NULLIF(ua.barangay, ''),
                    NULLIF(ua.city, ''),
                    NULLIF(ua.province, ''),
                    NULLIF(ua.region, '')
                  )
                  FROM user_addresses ua 
                  WHERE ua.user_id = o.buyer_id 
                  ORDER BY ua.is_default DESC, ua.updated_at DESC 
                  LIMIT 1
                ) as buyer_full_address,
                -- buyer coords (prefer user_addresses, fallback to users.location_lat/lng)
                COALESCE(
                (
                  SELECT ua.latitude FROM user_addresses ua 
                  WHERE ua.user_id = o.buyer_id 
                  ORDER BY ua.is_default DESC, ua.updated_at DESC 
                  LIMIT 1
                  ),
                  u.location_lat
                ) as buyer_latitude,
                COALESCE(
                (
                  SELECT ua.longitude FROM user_addresses ua 
                  WHERE ua.user_id = o.buyer_id 
                  ORDER BY ua.is_default DESC, ua.updated_at DESC 
                  LIMIT 1
                  ),
                  u.location_lng
                ) as buyer_longitude,
                -- seller (shop) coords from users table (prefer user_addresses, fallback to users.location_lat/lng)
                COALESCE(
                  (
                    SELECT sa.latitude FROM user_addresses sa 
                    WHERE sa.user_id = o.seller_id 
                    AND sa.label = 'Business Address'
                    ORDER BY sa.is_default DESC, sa.updated_at DESC 
                    LIMIT 1
                  ),
                  s.location_lat
                ) as seller_latitude,
                COALESCE(
                  (
                    SELECT sa.longitude FROM user_addresses sa 
                    WHERE sa.user_id = o.seller_id 
                    AND sa.label = 'Business Address'
                    ORDER BY sa.is_default DESC, sa.updated_at DESC 
                    LIMIT 1
                  ),
                  s.location_lng
                ) as seller_longitude,
                s.name as seller_name,
                s.phone as seller_phone
            FROM deliveries d
            LEFT JOIN orders o ON d.order_id = o.id
            LEFT JOIN users u ON o.buyer_id = u.id
            LEFT JOIN users s ON o.seller_id = s.id
            WHERE d.rider_id = %s
        """
        
        params = [rider_id]
        
        if status_filter:
            base_query += " AND d.status = %s"
            params.append(status_filter)
        else:
            base_query += " AND d.status IN ('assigned', 'picked_up', 'in_transit')"
        
        base_query += " ORDER BY d.created_at DESC"
        
        cursor.execute(base_query, params)
        deliveries = cursor.fetchall()
        
        formatted_deliveries = []
        for delivery in deliveries:
            # Get complete addresses from user_addresses table
            seller_pickup_address = delivery.get('seller_full_address') or delivery.get('pickup_address') or 'Seller shop address not available'
            buyer_delivery_address = delivery.get('buyer_full_address') or delivery.get('delivery_address') or delivery.get('order_delivery_address') or 'Unknown Address'
            
            formatted_deliveries.append({
                'id': delivery['id'],
                'order_number': delivery['order_number'],
                'customer_name': delivery['customer_name'] or delivery['customer_name_alt'] or 'Unknown',
                'customer_email': delivery['customer_email'],
                'customer_phone': delivery['customer_phone'],
                'seller_name': delivery.get('seller_name') or 'Shop',
                'seller_phone': delivery.get('seller_phone') or 'N/A',
                'pickup_address': seller_pickup_address,
                'seller_address': seller_pickup_address,
                'delivery_address': buyer_delivery_address,
                'buyer_address': buyer_delivery_address,
                'distance': float(delivery['distance']) if delivery['distance'] else 0,
                'delivery_fee': float(delivery['delivery_fee']),
                'base_fee': float(delivery['base_fee']),
                'tips': float(delivery['tips']) if delivery['tips'] else 0,
                'estimated_time': delivery['estimated_time'],
                'actual_time': delivery['actual_time'],
                'delivery_type': delivery['delivery_type'],
                'priority': delivery['priority'],
                'status': delivery['status'],
                'order_total': float(delivery['total_amount']) if delivery['total_amount'] else 0,
                'created_at': delivery['created_at'].isoformat() if delivery['created_at'] else None,
                'assigned_at': delivery['assigned_at'].isoformat() if delivery['assigned_at'] else None,
                'pickup_time': delivery['pickup_time'].isoformat() if delivery['pickup_time'] else None,
                'delivery_time': delivery['delivery_time'].isoformat() if delivery['delivery_time'] else None,
                # coordinates for OSM maps
                'buyer_lat': float(delivery['buyer_latitude']) if delivery.get('buyer_latitude') is not None else None,
                'buyer_lng': float(delivery['buyer_longitude']) if delivery.get('buyer_longitude') is not None else None,
                'seller_lat': float(delivery['seller_latitude']) if delivery.get('seller_latitude') is not None else None,
                'seller_lng': float(delivery['seller_longitude']) if delivery.get('seller_longitude') is not None else None
            })
        
        return jsonify({
            'success': True,
            'deliveries': formatted_deliveries,
            'total': len(formatted_deliveries)
        })
        
    except Exception as e:
        print(f"Error getting rider deliveries: {str(e)}")
        return jsonify({'error': 'Failed to get deliveries'}), 500
    finally:
        cursor.close()
        connection.close()

# Accept delivery
@app.route('/api/rider/deliveries/<int:delivery_id>/accept', methods=['POST'])
@token_required
@rider_required
def accept_delivery(current_user, delivery_id):
    """Accept a delivery assignment (race-safe)."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        rider_id = current_user['id']
        
        # Begin transaction and lock the delivery row
        cursor.execute("START TRANSACTION")
        cursor.execute(
            """
            SELECT id, order_id
            FROM deliveries
            WHERE id = %s AND rider_id IS NULL AND status = 'pending'
            FOR UPDATE
            """,
            (delivery_id,)
        )
        row = cursor.fetchone()
        if not row:
            connection.rollback()
            return jsonify({'error': 'Delivery no longer available'}), 409
        
        # Claim the delivery in a guarded update
        cursor.execute(
            """
            UPDATE deliveries 
            SET rider_id = %s, status = 'assigned', assigned_at = NOW()
            WHERE id = %s AND rider_id IS NULL AND status = 'pending'
            """,
            (rider_id, delivery_id)
        )
        if cursor.rowcount != 1:
            connection.rollback()
            return jsonify({'error': 'Delivery no longer available'}), 409
        
        # Reflect assignment in order status
        cursor.execute(
            """
            UPDATE orders 
            SET status = 'shipped'
            WHERE id = %s
            """,
            (row['order_id'],)
        )
        
        # Notification payload
        cursor.execute(
            """
            SELECT o.order_number, o.seller_id, o.buyer_id,
                   r.name AS rider_name, r.phone AS rider_phone
            FROM orders o, users r
            WHERE o.id = %s AND r.id = %s
            """,
            (row['order_id'], rider_id)
        )
        order_info = cursor.fetchone()
        if order_info:
            # Seller notification
            if order_info['seller_id']:
                cursor.execute(
                    """
                    INSERT INTO notifications (user_id, type, message, reference_id, created_at)
                    VALUES (%s, %s, %s, %s, NOW())
                    """,
                    (
                        order_info['seller_id'],
                        'delivery_assigned',
                        f"🚚 Rider {order_info['rider_name']} has been assigned to order #{order_info['order_number']} and will pick up your package soon!",
                        row['order_id']
                    )
                )
            # Buyer notification
            if order_info['buyer_id']:
                cursor.execute(
                    """
                    INSERT INTO notifications (user_id, type, message, reference_id, created_at)
                    VALUES (%s, %s, %s, %s, NOW())
                    """,
                    (
                        order_info['buyer_id'],
                        'delivery_started',
                        f"📦 Your order #{order_info['order_number']} has been assigned to rider {order_info['rider_name']} for delivery!",
                        row['order_id']
                    )
                )
        
        connection.commit()
        
        return jsonify({
            'success': True,
            'message': 'Delivery accepted successfully',
            'rider_info': {
                'name': order_info['rider_name'] if order_info else 'Unknown',
                'phone': order_info['rider_phone'] if order_info else None
            }
        })
        
    except Exception as e:
        connection.rollback()
        print(f"Error accepting delivery: {str(e)}")
        return jsonify({'error': 'Failed to accept delivery'}), 500
    finally:
        cursor.close()
        connection.close()
# Update delivery status
@app.route('/api/rider/deliveries/<int:delivery_id>/status', methods=['PUT'])
@token_required
@rider_required
def update_delivery_status(current_user, delivery_id):
    """Update delivery status"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        rider_id = current_user['id']
        data = request.get_json()
        new_status = data.get('status')
        
        # Allow assigned, picked_up, in_transit, delivered statuses
        if new_status not in ['assigned', 'picked_up', 'in_transit', 'delivered']:
            return jsonify({'error': f'Invalid status: {new_status}. Must be one of: assigned, picked_up, in_transit, delivered'}), 400
        
        # Check if delivery belongs to rider
        cursor.execute("""
            SELECT d.*, o.order_number 
            FROM deliveries d
            LEFT JOIN orders o ON d.order_id = o.id
            WHERE d.id = %s AND d.rider_id = %s
        """, (delivery_id, rider_id))
        
        delivery = cursor.fetchone()
        if not delivery:
            # Log more details for debugging
            print(f"[ERROR] Delivery {delivery_id} not found or not assigned to rider {rider_id}")
            
            # Check if delivery exists at all
            cursor.execute("SELECT id, rider_id, status FROM deliveries WHERE id = %s", (delivery_id,))
            check_delivery = cursor.fetchone()
            
            if not check_delivery:
                print(f"[ERROR] Delivery {delivery_id} does not exist in database")
                return jsonify({'error': f'Delivery #{delivery_id} not found'}), 404
            else:
                print(f"[ERROR] Delivery {delivery_id} exists but assigned to rider_id={check_delivery['rider_id']}, not {rider_id}")
                return jsonify({'error': f'Delivery #{delivery_id} is not assigned to you (current rider: {check_delivery["rider_id"]}, status: {check_delivery["status"]})'}, 403)
        
        # Update status with appropriate timestamp
        update_query = "UPDATE deliveries SET status = %s"
        params = [new_status]
        
        if new_status == 'picked_up':
            update_query += ", pickup_time = NOW()"
        elif new_status == 'in_transit':
            # No additional timestamp for in_transit, but we can log it
            pass
        elif new_status == 'delivered':
            update_query += ", delivery_time = NOW(), completed_at = NOW()"
            # Calculate actual delivery time
            if delivery['pickup_time']:
                update_query += ", actual_time = TIMESTAMPDIFF(MINUTE, pickup_time, NOW())"
        
        update_query += " WHERE id = %s"
        params.append(delivery_id)
        
        cursor.execute(update_query, params)
        
        # AUTOMATIC ORDER STATUS SYNC - Update order status based on delivery status
        order_status_mapping = {
            'assigned': 'shipped',  # When assigned to rider, order becomes shipped
            'picked_up': 'shipped',  # When rider picks up, order becomes shipped
            'in_transit': 'shipped',  # Still shipped while in transit
            'delivered': 'delivered'  # Final status
        }
        
        if new_status in order_status_mapping:
            new_order_status = order_status_mapping[new_status]
            cursor.execute("""
                UPDATE orders SET status = %s 
                WHERE id = %s
            """, (new_order_status, delivery['order_id']))
            
            print(f"[ORDER-SYNC] Order {delivery['order_id']} status updated to {new_order_status} based on delivery status {new_status}")
        
        # RIDER AVAILABILITY MANAGEMENT - Update rider status after delivery completion
        if new_status == 'delivered':
            # Check if rider has any other active deliveries
            cursor.execute("""
                SELECT COUNT(*) as active_count FROM deliveries 
                WHERE rider_id = %s AND status IN ('assigned', 'picked_up', 'in_transit') AND id != %s
            """, (rider_id, delivery_id))
            
            active_count = cursor.fetchone()['active_count']
            
            if active_count == 0:
                # No other active deliveries, set rider as available
                cursor.execute("UPDATE users SET status = 'available' WHERE id = %s", (rider_id,))
                print(f"[RIDER-STATUS] Rider {rider_id} set to available after completing delivery {delivery_id}")
            else:
                print(f"[RIDER-STATUS] Rider {rider_id} still has {active_count} active deliveries")
        
        # CREATE NOTIFICATIONS for status changes
        try:
            # Get order and customer info for notifications
            cursor.execute("""
                SELECT o.order_number, o.buyer_id, o.full_name as customer_name
                FROM orders o WHERE o.id = %s
            """, (delivery['order_id'],))
            
            order_info = cursor.fetchone()
            
            if order_info and order_info['buyer_id']:
                notification_messages = {
                    'assigned': f"Your order #{order_info['order_number']} has been assigned to a rider",
                    'picked_up': f"Your order #{order_info['order_number']} has been picked up by the rider",
                    'in_transit': f"Your order #{order_info['order_number']} is on the way",
                    'delivered': f"Your order #{order_info['order_number']} has been delivered successfully"
                }
                
                if new_status in notification_messages:
                    cursor.execute("""
                        INSERT INTO notifications (user_id, type, message, reference_id, created_at)
                        VALUES (%s, %s, %s, %s, NOW())
                    """, (
                        order_info['buyer_id'], 
                        f'delivery_{new_status}', 
                        notification_messages[new_status], 
                        delivery['order_id']
                    ))
                    
                    print(f"[NOTIFICATION] Created {new_status} notification for customer {order_info['buyer_id']}")
        except Exception as e:
            print(f"[NOTIFICATION] Error creating notification: {str(e)}")
            # Don't fail the whole request if notification fails
        
        connection.commit()
        
        return jsonify({
            'success': True,
            'message': f'Delivery status updated to {new_status}'
        })
        
    except Exception as e:
        connection.rollback()
        print(f"Error updating delivery status: {str(e)}")
        return jsonify({'error': 'Failed to update status'}), 500
    finally:
        cursor.close()
        connection.close()

def buyer_list_chats_helper(current_user):
    """Helper function for buyer_list_chats that can be called without decorator"""
    if current_user.get('role') not in ['buyer', 'seller', 'admin']:
        return jsonify({'error': 'Unauthorized'}), 403
    buyer_id = current_user['id'] if current_user.get('role') == 'buyer' else None

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = connection.cursor(dictionary=True)
    try:
        order_number = request.args.get('order_number')
        if order_number:
            # Fetch a specific conversation for this buyer and order_number
            cur.execute("SELECT id FROM orders WHERE order_number = %s", (order_number,))
            order_rec = cur.fetchone()
            if not order_rec:
                return jsonify({'chats': []})
            order_id = order_rec['id']
            cur.execute(
                """
                SELECT cc.*, u.name as seller_name, u_admin.name as admin_name
                FROM chat_conversations cc
                LEFT JOIN users u ON u.id = cc.seller_id
                LEFT JOIN users u_admin ON u_admin.id = cc.admin_id
                WHERE cc.order_id = %s {and_buyer}
                ORDER BY cc.updated_at DESC, cc.created_at DESC
                """.format(and_buyer=f"AND cc.buyer_id = %s" if buyer_id else ""),
                (order_id,) if not buyer_id else (order_id, buyer_id)
            )
            rows = cur.fetchall() or []
        else:
            # List all conversations for current buyer (including admin chats)
            if buyer_id:
                cur.execute(
                    """
                    SELECT cc.*, u.name as seller_name, u_admin.name as admin_name
                    FROM chat_conversations cc
                    LEFT JOIN users u ON u.id = cc.seller_id
                    LEFT JOIN users u_admin ON u_admin.id = cc.admin_id
                    WHERE cc.buyer_id = %s
                    ORDER BY cc.updated_at DESC, cc.created_at DESC
                    """,
                    (buyer_id,)
                )
                rows = cur.fetchall() or []
            else:
                # If seller/admin calls this endpoint, return empty by default
                rows = []

        chats = []
        for r in rows:
            # Last message and unread
            last_message = None
            last_time = None
            unread_count = 0
            try:
                cur.execute(
                    """
                    SELECT content, created_at FROM chat_messages
                    WHERE conversation_id = %s ORDER BY created_at DESC LIMIT 1
                    """,
                    (r['id'],)
                )
                lm = cur.fetchone()
                if lm:
                    last_message = lm['content']
                    last_time = lm['created_at']
                if buyer_id:
                    cur.execute(
                        """
                        SELECT COUNT(*) AS c FROM chat_messages
                        WHERE conversation_id = %s AND is_read = 0 AND sender_id <> %s
                        """,
                        (r['id'], buyer_id)
                    )
                    unread_count = cur.fetchone()['c']
            except Exception:
                pass

            # Determine participant name - seller, admin, or default
            participant_name = 'Seller'
            if r.get('admin_id'):
                participant_name = r.get('admin_name') or 'Admin'
            elif r.get('seller_id'):
                participant_name = r.get('seller_name') or 'Seller'
            
            chats.append({
                'id': r['id'],
                'order_id': r.get('order_id'),
                'order_number': r.get('order_number'),
                'participant_name': participant_name,
                'seller_id': r.get('seller_id'),
                'admin_id': r.get('admin_id'),
                'is_admin_chat': bool(r.get('admin_id')),
                'last_message': last_message,
                'last_message_time': last_time.isoformat() if last_time else None,
                'unread_count': unread_count
            })

        return jsonify({'success': True, 'chats': chats})
    except Exception as e:
        print('[BUYER CHAT] list error:', e)
        return jsonify({'error': 'Failed to load chats'}), 500
    finally:
        cur.close(); connection.close()

@app.route('/api/buyer/chats', methods=['GET'])
@token_required
def buyer_list_chats(current_user):
    return buyer_list_chats_helper(current_user)

@app.route('/api/buyer/chats', methods=['POST'])
@token_required
def buyer_create_chat(current_user):
    if current_user.get('role') != 'buyer':
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.get_json() or {}
    order_number = data.get('order_number')
    order_id = data.get('order_id')
    chat_type = data.get('chat_type', 'seller')  # 'seller' or 'admin'
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = connection.cursor(dictionary=True)
    try:
        if chat_type == 'admin':
            # Find an available admin
            cur.execute("SELECT id, name FROM users WHERE role = 'admin' AND status = 'active' LIMIT 1")
            admin = cur.fetchone()
            if not admin:
                return jsonify({'error': 'No admin available'}), 404
            
            # Get order_id if order_number provided
            if order_number and not order_id:
                cur.execute("SELECT id FROM orders WHERE order_number = %s", (order_number,))
                order_row = cur.fetchone()
                if order_row:
                    order_id = order_row['id']
            
            # Check if conversation already exists (with order_id if provided)
            if order_id:
                cur.execute("""
                    SELECT * FROM chat_conversations 
                    WHERE buyer_id = %s AND admin_id = %s AND order_id = %s
                """, (current_user['id'], admin['id'], order_id))
            else:
                cur.execute("SELECT * FROM chat_conversations WHERE buyer_id = %s AND admin_id = %s AND order_id IS NULL",
                            (current_user['id'], admin['id']))
            conv = cur.fetchone()
            
            if conv:
                chat_id = conv['id']
                # Send initial message with order context if order_id provided and no messages exist
                if order_id:
                    cur.execute("SELECT COUNT(*) as count FROM chat_messages WHERE conversation_id = %s", (chat_id,))
                    msg_count = cur.fetchone()['count']
                    if msg_count == 0:
                        user_role = 'Buyer'
                        initial_message = f"Hello, I need assistance with Order #{order_number or order_id}. I'm the {user_role}."
                        cur.execute("""
                            INSERT INTO chat_messages (conversation_id, sender_id, sender_type, content, created_at)
                            VALUES (%s, %s, 'buyer', %s, NOW())
                        """, (chat_id, current_user['id'], initial_message))
                        cur.execute("UPDATE chat_conversations SET last_message_time = NOW() WHERE id = %s", (chat_id,))
                        connection.commit()
                return jsonify({'success': True, 'chat': {'id': chat_id}})
            
            # Create admin conversation
            cur.execute(
                """
                INSERT INTO chat_conversations (buyer_id, admin_id, participant_name, status, order_id, created_at)
                VALUES (%s, %s, %s, 'active', %s, NOW())
                """,
                (current_user['id'], admin['id'], admin['name'] or 'Admin', order_id)
            )
            chat_id = cur.lastrowid
            
            # Send initial message with order context if order_id provided
            if order_id:
                user_role = 'Buyer'
                initial_message = f"Hello, I need assistance with Order #{order_number or order_id}. I'm the {user_role}."
                cur.execute("""
                    INSERT INTO chat_messages (conversation_id, sender_id, sender_type, content, created_at)
                    VALUES (%s, %s, 'buyer', %s, NOW())
                """, (chat_id, current_user['id'], initial_message))
                cur.execute("UPDATE chat_conversations SET last_message_time = NOW() WHERE id = %s", (chat_id,))
            
            connection.commit()
            return jsonify({'success': True, 'chat': {'id': chat_id}})
        else:
            # Original seller chat logic
            if not order_number:
                return jsonify({'error': 'order_number required for seller chat'}), 400
            
            # Validate buyer owns the order and get seller_id
            cur.execute("SELECT id, buyer_id, seller_id FROM orders WHERE order_number = %s", (order_number,))
            order = cur.fetchone()
            if not order or order['buyer_id'] != current_user['id']:
                return jsonify({'error': 'Order not found or unauthorized'}), 404

            # Find existing conversation
            cur.execute("SELECT * FROM chat_conversations WHERE order_id = %s AND buyer_id = %s AND seller_id = %s",
                        (order['id'], current_user['id'], order['seller_id']))
            conv = cur.fetchone()
            if conv:
                return jsonify({'success': True, 'chat': {'id': conv['id']}})

            # Create conversation
            cur.execute(
                """
                INSERT INTO chat_conversations (order_id, order_number, seller_id, buyer_id, participant_name, status, created_at)
                VALUES (%s, %s, %s, %s, %s, 'active', NOW())
                """,
                (order['id'], order_number, order['seller_id'], current_user['id'], 'Shop')
            )
            chat_id = cur.lastrowid
            connection.commit()
            return jsonify({'success': True, 'chat': {'id': chat_id}})
    except Exception as e:
        connection.rollback()
        print('[BUYER CHAT] create error:', e)
        return jsonify({'error': 'Failed to create chat'}), 500
    finally:
        cur.close(); connection.close()

@app.route('/api/buyer/chats/<int:chat_id>/messages', methods=['GET'])
@token_required
def buyer_get_chat_messages(current_user, chat_id):
    if current_user.get('role') not in ['buyer', 'seller', 'admin']:
        return jsonify({'error': 'Unauthorized'}), 403

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = connection.cursor(dictionary=True)
    try:
        # Verify access: buyer, seller, or admin must be participant
        cur.execute("SELECT buyer_id, seller_id, admin_id FROM chat_conversations WHERE id = %s", (chat_id,))
        rec = cur.fetchone()
        if not rec:
            return jsonify({'error': 'Conversation not found'}), 404
        
        user_role = current_user.get('role')
        has_access = False
        if user_role == 'buyer' and rec['buyer_id'] == current_user['id']:
            has_access = True
        elif user_role == 'seller' and rec.get('seller_id') == current_user['id']:
            has_access = True
        elif user_role == 'admin' and rec.get('admin_id') == current_user['id']:
            has_access = True
        
        if not has_access:
            return jsonify({'error': 'Forbidden'}), 403

        cur.execute(
            """
            SELECT id, sender_id, sender_type, content, message_type, file_url, is_read, created_at
            FROM chat_messages
            WHERE conversation_id = %s
            ORDER BY created_at ASC
            """,
            (chat_id,)
        )
        rows = cur.fetchall() or []
        messages = [{
            'id': m['id'],
            'sender_id': m['sender_id'],
            'sender_type': m['sender_type'],
            'content': m['content'],
            'message_type': m.get('message_type') or 'text',
            'file_url': m.get('file_url'),
            'is_read': bool(m['is_read']),
            'created_at': m['created_at'].isoformat() if m.get('created_at') else None
        } for m in rows]
        return jsonify({'success': True, 'messages': messages})
    except Exception as e:
        print('[BUYER CHAT] get messages error:', e)
        return jsonify({'error': 'Failed to load messages'}), 500
    finally:
        cur.close(); connection.close()

@app.route('/api/buyer/chats/<int:chat_id>/messages', methods=['POST'])
@token_required
def buyer_send_message(current_user, chat_id):
    if current_user.get('role') not in ['buyer', 'seller']:
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.get_json() or {}
    content = (data.get('content') or '').strip()
    if not content:
        return jsonify({'error': 'Content required'}), 400

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = connection.cursor(dictionary=True)
    try:
        # Verify access for buyer
        cur.execute("SELECT buyer_id FROM chat_conversations WHERE id = %s", (chat_id,))
        conv = cur.fetchone()
        if not conv:
            return jsonify({'error': 'Conversation not found'}), 404
        # Determine sender type correctly
        sender_type = current_user.get('role', '').lower()
        if sender_type not in ['buyer', 'seller', 'admin']:
            return jsonify({'error': 'Invalid user role for this endpoint'}), 403
        
        # Verify access based on conversation type
        if sender_type == 'buyer' and conv['buyer_id'] != current_user['id']:
            return jsonify({'error': 'Forbidden'}), 403
        elif sender_type == 'seller' and conv.get('seller_id') != current_user['id']:
            return jsonify({'error': 'Forbidden'}), 403
        elif sender_type == 'admin' and conv.get('admin_id') != current_user['id']:
            return jsonify({'error': 'Forbidden'}), 403

        cur.execute(
            """
            INSERT INTO chat_messages (conversation_id, sender_id, sender_type, content, message_type, is_read, created_at)
            VALUES (%s, %s, %s, %s, 'text', 0, NOW())
            """,
            (chat_id, current_user['id'], sender_type, content)
        )
        connection.commit()
        return jsonify({'success': True})
    except Exception as e:
        connection.rollback()
        print('[BUYER CHAT] send error:', e)
        return jsonify({'error': 'Failed to send message'}), 500
    finally:
        cur.close(); connection.close()

@app.route('/api/buyer/chats/<int:chat_id>/read', methods=['PUT','POST'])
@token_required
def buyer_mark_chat_read(current_user, chat_id):
    if current_user.get('role') not in ['buyer', 'seller', 'admin']:
        return jsonify({'error': 'Unauthorized'}), 403
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = connection.cursor()
    try:
        # Mark messages not sent by this user as read
        cur.execute(
            """
            UPDATE chat_messages SET is_read = 1
            WHERE conversation_id = %s AND sender_id <> %s
            """,
            (chat_id, current_user['id'])
        )
        connection.commit()
        return jsonify({'success': True})
    except Exception as e:
        connection.rollback()
        print('[BUYER CHAT] mark read error:', e)
        return jsonify({'error': 'Failed to mark as read'}), 500
    finally:
        cur.close(); connection.close()
@app.route('/api/rider/messages/conversations', methods=['GET'])
@token_required
@rider_required
def rider_list_conversations(current_user):
    """List conversations for a rider - completely independent from buyer-seller chats"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = connection.cursor(dictionary=True)
    try:
        rider_id = current_user['id']
        # Get orders assigned to this rider
        cur.execute("""
            SELECT 
                o.id AS order_id,
                o.order_number,
                o.buyer_id,
                o.seller_id,
                o.full_name AS customer_name,
                u_buyer.name AS buyer_name,
                u_buyer.profile_picture AS buyer_profile_pic,
                u_seller.name AS seller_name,
                u_seller.profile_picture AS seller_profile_pic,
                d.status AS delivery_status,
                d.created_at AS delivery_created_at
            FROM orders o
            JOIN deliveries d ON d.order_id = o.id
            LEFT JOIN users u_buyer ON o.buyer_id = u_buyer.id
            LEFT JOIN users u_seller ON o.seller_id = u_seller.id
            WHERE d.rider_id = %s
            ORDER BY o.created_at DESC
        """, (rider_id,))
        rows = cur.fetchall() or []

        conversations = []
        for r in rows:
            # Create separate rider conversations for buyer and seller
            # These are completely independent from buyer-seller conversations
            
            # Rider-Buyer conversation (virtual ID: -1000 - order_id)
            rider_buyer_conv_id = -1000 - r['order_id']
            
            # Rider-Seller conversation (virtual ID: -2000 - order_id)  
            rider_seller_conv_id = -2000 - r['order_id']
            
            # Get rider-specific message history for this order
            buyer_messages = []
            seller_messages = []
            try:
                # Get rider messages with buyer
                cur.execute("""
                    SELECT content, created_at, is_read
                    FROM rider_messages
                    WHERE rider_id = %s AND order_id = %s AND participant_type = 'buyer'
                    ORDER BY created_at DESC
                    LIMIT 1
                """, (rider_id, r['order_id']))
                buyer_msg = cur.fetchone()
                
                # Get rider messages with seller
                cur.execute("""
                    SELECT content, created_at, is_read
                    FROM rider_messages
                    WHERE rider_id = %s AND order_id = %s AND participant_type = 'seller'
                    ORDER BY created_at DESC
                    LIMIT 1
                """, (rider_id, r['order_id']))
                seller_msg = cur.fetchone()
                
                # Get unread counts
                cur.execute("""
                    SELECT COUNT(*) AS c FROM rider_messages
                    WHERE rider_id = %s AND order_id = %s AND participant_type = 'buyer' 
                    AND is_read = 0 AND sender_type <> 'rider'
                """, (rider_id, r['order_id']))
                buyer_unread = cur.fetchone()['c']
                
                cur.execute("""
                    SELECT COUNT(*) AS c FROM rider_messages
                    WHERE rider_id = %s AND order_id = %s AND participant_type = 'seller' 
                    AND is_read = 0 AND sender_type <> 'rider'
                """, (rider_id, r['order_id']))
                seller_unread = cur.fetchone()['c']
                
            except Exception as e:
                print(f"[RIDER CHAT] Error fetching messages: {e}")
                buyer_msg = None
                seller_msg = None
                buyer_unread = 0
                seller_unread = 0

            buyer_name = r.get('buyer_name') or 'Buyer'
            seller_name = r.get('seller_name') or 'Seller'
            
            # Add rider-buyer conversation
            # Convert datetime to string for consistent sorting
            buyer_msg_time = buyer_msg['created_at'] if buyer_msg and buyer_msg.get('created_at') else None
            if buyer_msg_time and hasattr(buyer_msg_time, 'isoformat'):
                buyer_msg_time = buyer_msg_time.isoformat()
            
            conversations.append({
                'id': rider_buyer_conv_id,
                'order_id': r['order_id'],
                'order_number': r['order_number'],
                'buyer_name': buyer_name,
                'seller_name': seller_name,
                'buyer_id': r.get('buyer_id'),
                'seller_id': r.get('seller_id'),
                'participant_name': buyer_name,
                'participant_type': 'buyer',
                'type': 'customer',
                'last_message': buyer_msg['content'] if buyer_msg else None,
                'last_message_time': buyer_msg_time,
                'unread_count': buyer_unread,
                'delivery_status': r['delivery_status']
            })
            
            # Add rider-seller conversation (if different from buyer)
            if buyer_name != seller_name:
                # Convert datetime to string for consistent sorting
                seller_msg_time = seller_msg['created_at'] if seller_msg and seller_msg.get('created_at') else None
                if seller_msg_time and hasattr(seller_msg_time, 'isoformat'):
                    seller_msg_time = seller_msg_time.isoformat()
                
                conversations.append({
                    'id': rider_seller_conv_id,
                    'order_id': r['order_id'],
                    'order_number': r['order_number'],
                    'buyer_name': buyer_name,
                    'seller_name': seller_name,
                    'buyer_id': r.get('buyer_id'),
                    'seller_id': r.get('seller_id'),
                    'participant_name': seller_name,
                    'participant_type': 'seller',
                    'type': 'seller',
                    'last_message': seller_msg['content'] if seller_msg else None,
                    'last_message_time': seller_msg_time,
                    'unread_count': seller_unread,
                    'delivery_status': r['delivery_status']
                })

        # Also get admin conversations from chat_conversations table
        cur.execute("""
            SELECT 
                cc.id,
                cc.order_id,
                cc.order_number,
                cc.admin_id,
                cc.rider_id,
                cc.status,
                cc.created_at,
                cc.last_message_time,
                u_admin.name AS admin_name,
                u_admin.profile_picture AS admin_profile_pic,
                (SELECT COUNT(*) 
                 FROM chat_messages cm 
                 WHERE cm.conversation_id = cc.id 
                 AND cm.is_read = FALSE 
                 AND cm.sender_id != %s) as unread_count,
                (SELECT cm.content 
                 FROM chat_messages cm 
                 WHERE cm.conversation_id = cc.id 
                 ORDER BY cm.created_at DESC LIMIT 1
                ) as last_message
            FROM chat_conversations cc
            LEFT JOIN users u_admin ON u_admin.id = cc.admin_id
            WHERE cc.rider_id = %s AND cc.admin_id IS NOT NULL
            ORDER BY cc.last_message_time DESC, cc.created_at DESC
        """, (rider_id, rider_id))
        admin_conversations = cur.fetchall() or []
        
        # Add admin conversations to the list
        for ac in admin_conversations:
            # Convert datetime to string for consistent sorting
            admin_msg_time = ac.get('last_message_time')
            if admin_msg_time and hasattr(admin_msg_time, 'isoformat'):
                admin_msg_time = admin_msg_time.isoformat()
            
            conversations.append({
                'id': ac['id'],  # Real conversation ID (positive)
                'order_id': ac.get('order_id'),
                'order_number': ac.get('order_number'),
                'participant_name': ac.get('admin_name') or 'Admin',
                'participant_type': 'admin',
                'type': 'admin',
                'last_message': ac.get('last_message'),
                'last_message_time': admin_msg_time,
                'unread_count': ac.get('unread_count', 0),
                'delivery_status': None  # Admin chats don't have delivery status
            })
        
        # Sort all conversations by last_message_time (handle both datetime and string)
        def get_sort_key(conv):
            time_val = conv.get('last_message_time') or conv.get('created_at')
            if time_val is None:
                return ''
            # Convert datetime to string for consistent sorting
            if hasattr(time_val, 'isoformat'):
                return time_val.isoformat()
            return str(time_val) if time_val else ''
        
        conversations.sort(key=get_sort_key, reverse=True)
        
        stats = {
            'total_messages': sum([c.get('unread_count', 0) for c in conversations]),
            'unread_messages': sum([c.get('unread_count', 0) for c in conversations]),
            'active_conversations': len(conversations),
            'avg_response_time': 0
        }
        return jsonify({'success': True, 'conversations': conversations, 'stats': stats})
    except Exception as e:
        print('[RIDER CHAT] conversations error:', e)
        return jsonify({'error': 'Failed to load conversations'}), 500
    finally:
        cur.close(); connection.close()

@app.route('/api/rider/messages/<conversation_id>', methods=['GET'])
@token_required
@rider_required
def rider_get_messages(current_user, conversation_id):
    """Get messages for a rider conversation using rider_messages table"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = connection.cursor(dictionary=True)
    try:
        # Parse conversation_id (can be negative integer)
        try:
            conversation_id = int(conversation_id)
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid conversation ID format'}), 400
        
        # Handle positive conversation IDs (admin conversations from chat_conversations)
        if conversation_id > 0:
            # Admin conversation - verify rider has access
            cur.execute("""
                SELECT cc.id, cc.order_id, cc.rider_id, cc.admin_id
                FROM chat_conversations cc
                WHERE cc.id = %s AND cc.rider_id = %s AND cc.admin_id IS NOT NULL
            """, (conversation_id, current_user['id']))
            conv = cur.fetchone()
            if not conv:
                return jsonify({'error': 'Forbidden'}), 403
            
            # Get messages from chat_messages table
            cur.execute("""
                SELECT 
                    cm.id,
                    cm.sender_id,
                    cm.sender_type,
                    cm.content,
                    cm.created_at,
                    cm.is_read,
                    u.name as sender_name,
                    u.profile_picture as sender_profile_pic
                FROM chat_messages cm
                LEFT JOIN users u ON u.id = cm.sender_id
                WHERE cm.conversation_id = %s
                ORDER BY cm.created_at ASC
            """, (conversation_id,))
            rows = cur.fetchall() or []
            
            # Format messages for frontend
            messages = []
            for row in rows:
                messages.append({
                    'id': row['id'],
                    'sender_id': row['sender_id'],
                    'sender_type': row['sender_type'],
                    'sender_name': row.get('sender_name', 'User'),
                    'content': row['content'],
                    'created_at': row['created_at'].isoformat() if row['created_at'] else None,
                    'is_read': bool(row['is_read']),
                    'is_own': row['sender_id'] == current_user['id']
                })
            
            return jsonify({
                'success': True,
                'messages': messages,
                'conversation': {
                    'id': conv['id'],
                    'order_id': conv.get('order_id'),
                    'participant_type': 'admin'
                }
            })
        
        # Handle negative conversation IDs (rider-specific conversations)
        # Negative IDs are virtual: -1000 - order_id for buyer, -2000 - order_id for seller
        if conversation_id <= -1000:
            if conversation_id <= -1000 and conversation_id > -2000:
                # Rider-buyer conversation: -1000 - order_id
                order_id = -(conversation_id + 1000)
                participant_type = 'buyer'
            elif conversation_id <= -2000:
                # Rider-seller conversation: -2000 - order_id  
                order_id = -(conversation_id + 2000)
                participant_type = 'seller'
            else:
                return jsonify({'error': 'Invalid conversation ID'}), 400
        else:
            return jsonify({'error': 'Invalid conversation ID format'}), 400
        
        # Verify rider has access to this order
        cur.execute("""
            SELECT 1 FROM orders o
            JOIN deliveries d ON d.order_id = o.id
            WHERE o.id = %s AND d.rider_id = %s
        """, (order_id, current_user['id']))
        if not cur.fetchone():
            return jsonify({'error': 'Forbidden'}), 403

        # Get messages from rider_messages table
        cur.execute(
            """
            SELECT id, sender_id, sender_type, content, message_type, file_url, is_read, created_at
            FROM rider_messages
            WHERE rider_id = %s AND order_id = %s AND participant_type = %s
            ORDER BY created_at ASC
            """,
            (current_user['id'], order_id, participant_type)
        )
        rows = cur.fetchall() or []
        out = []
        for m in rows:
            out.append({
                'id': m['id'],
                'sender_id': m['sender_id'],
                'sender_type': m['sender_type'],
                'content': m['content'],
                'message_type': m.get('message_type') or 'text',
                'file_url': m.get('file_url'),
                'is_read': bool(m['is_read']),
                'created_at': m['created_at'].isoformat() if m.get('created_at') else None
            })
        return jsonify({'success': True, 'messages': out})
    except Exception as e:
        print('[RIDER CHAT] get messages error:', e)
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to load messages', 'message': str(e)}), 500
    finally:
        cur.close(); connection.close()

@app.route('/api/rider/messages/<conversation_id>/send', methods=['POST'])
@token_required
@rider_required
def rider_send_message(current_user, conversation_id):
    """Send a message in a rider conversation using rider_messages table"""
    data = request.get_json() or {}
    content = data.get('content', '').strip()
    if not content:
        return jsonify({'error': 'Content required'}), 400

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = connection.cursor(dictionary=True)
    try:
        # Parse conversation_id (can be negative integer or positive for admin chats)
        try:
            conversation_id = int(conversation_id)
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid conversation ID format'}), 400
        
        # Handle positive conversation IDs (admin conversations from chat_conversations)
        if conversation_id > 0:
            # Admin conversation - verify rider has access and send message
            cur.execute("""
                SELECT cc.id, cc.order_id, cc.rider_id, cc.admin_id
                FROM chat_conversations cc
                WHERE cc.id = %s AND cc.rider_id = %s AND cc.admin_id IS NOT NULL
            """, (conversation_id, current_user['id']))
            conv = cur.fetchone()
            if not conv:
                return jsonify({'error': 'Forbidden'}), 403
            
            # Insert message into chat_messages table
            cur.execute("""
                INSERT INTO chat_messages (conversation_id, sender_id, sender_type, content, created_at)
                VALUES (%s, %s, %s, %s, NOW())
            """, (conversation_id, current_user['id'], 'rider', content))
            
            # Update last_message_time
            cur.execute("UPDATE chat_conversations SET last_message_time = NOW() WHERE id = %s", (conversation_id,))
            connection.commit()
            
            return jsonify({'success': True, 'message': 'Message sent'})
        
        # Handle negative conversation IDs (rider-specific conversations)
        # Negative IDs are virtual: -1000 - order_id for buyer, -2000 - order_id for seller
        if conversation_id <= -1000:
            if conversation_id <= -1000 and conversation_id > -2000:
                # Rider-buyer conversation: -1000 - order_id
                order_id = -(conversation_id + 1000)
                participant_type = 'buyer'
            elif conversation_id <= -2000:
                # Rider-seller conversation: -2000 - order_id  
                order_id = -(conversation_id + 2000)
                participant_type = 'seller'
            else:
                return jsonify({'error': 'Invalid conversation ID'}), 400
        else:
            return jsonify({'error': 'Invalid conversation ID format'}), 400
        
        # Verify conversation belongs to an order assigned to this rider
        cur.execute("""
            SELECT o.id AS order_id, d.status AS delivery_status,
                   o.buyer_id, o.seller_id, d.id AS delivery_id
            FROM orders o
            JOIN deliveries d ON d.order_id = o.id
            WHERE o.id = %s AND d.rider_id = %s
            ORDER BY d.created_at DESC
            LIMIT 1
        """, (order_id, current_user['id']))
        conv_row = cur.fetchone()
        if not conv_row:
            # Check if order exists but not assigned to this rider
            cur.execute("""
                SELECT o.id, d.rider_id, d.status
                FROM orders o
                LEFT JOIN deliveries d ON d.order_id = o.id
                WHERE o.id = %s
                LIMIT 1
            """, (order_id,))
            check_row = cur.fetchone()
            if check_row:
                if check_row.get('rider_id') and check_row['rider_id'] != current_user['id']:
                    return jsonify({'error': 'This order is assigned to a different rider'}), 403
                elif not check_row.get('rider_id'):
                    return jsonify({'error': 'This order is not yet assigned to a rider'}), 403
            return jsonify({'error': 'Order not found or not assigned to you'}), 403

        delivery_status = (conv_row.get('delivery_status') or '').lower()
        
        # Debug logging
        print(f'[RIDER CHAT] Sending message - Order ID: {order_id}, Delivery ID: {conv_row.get("delivery_id")}, Status: {delivery_status}, Participant: {participant_type}')
        
        # Allow chatting for active delivery statuses (including pending if assigned)
        # Only block chatting after delivery is completed or cancelled
        blocked_statuses = {'delivered', 'cancelled'}
        if delivery_status in blocked_statuses:
            print(f'[RIDER CHAT] Blocked: Delivery status is {delivery_status}')
            return jsonify({
                'error': f'Chat disabled: delivery status is "{delivery_status}". Chatting is only available for active deliveries.',
                'delivery_status': delivery_status
            }), 403

        # Get participant ID based on participant type
        participant_id = conv_row['buyer_id'] if participant_type == 'buyer' else conv_row['seller_id']

        cur.execute(
            """
            INSERT INTO rider_messages (rider_id, order_id, participant_type, participant_id, sender_id, sender_type, content, message_type, is_read, created_at)
            VALUES (%s, %s, %s, %s, %s, 'rider', %s, 'text', 0, NOW())
            """,
            (current_user['id'], order_id, participant_type, participant_id, current_user['id'], content)
        )
        connection.commit()
        return jsonify({'success': True})
    except Exception as e:
        connection.rollback()
        print('[RIDER CHAT] send error:', e)
        return jsonify({'error': 'Failed to send message'}), 500
    finally:
        cur.close(); connection.close()

@app.route('/api/rider/messages/<conversation_id>/read', methods=['POST'])
@token_required
@rider_required
def rider_mark_read(current_user, conversation_id):
    """Mark rider conversation messages as read using rider_messages table"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = connection.cursor()
    try:
        # Parse conversation_id (can be negative integer)
        try:
            conversation_id = int(conversation_id)
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid conversation ID format'}), 400
        
        # Handle negative conversation IDs (rider-specific conversations)
        # Negative IDs are virtual: -1000 - order_id for buyer, -2000 - order_id for seller
        if conversation_id <= -1000:
            if conversation_id <= -1000 and conversation_id > -2000:
                # Rider-buyer conversation: -1000 - order_id
                order_id = -(conversation_id + 1000)
                participant_type = 'buyer'
            elif conversation_id <= -2000:
                # Rider-seller conversation: -2000 - order_id  
                order_id = -(conversation_id + 2000)
                participant_type = 'seller'
            else:
                return jsonify({'error': 'Invalid conversation ID'}), 400
        else:
            return jsonify({'error': 'Invalid conversation ID format'}), 400
        
        cur.execute(
            """
            UPDATE rider_messages SET is_read = 1
            WHERE rider_id = %s AND order_id = %s AND participant_type = %s AND sender_type <> 'rider'
            """,
            (current_user['id'], order_id, participant_type)
        )
        connection.commit()
        return jsonify({'success': True})
    except Exception as e:
        connection.rollback()
        print('[RIDER CHAT] read error:', e)
        return jsonify({'error': 'Failed to mark as read'}), 500
    finally:
        cur.close()
        connection.close()

# Upload delivery proof
@app.route('/api/rider/deliveries/<int:delivery_id>/proof', methods=['POST'])
@token_required
@rider_required
def upload_delivery_proof(current_user, delivery_id):
    """Upload delivery proof (photo, signature, notes) and mark as delivered"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        rider_id = current_user['id']
        
        # Check if delivery belongs to rider and can be completed
        cursor.execute("""
            SELECT d.*, o.id as order_id 
            FROM deliveries d
            LEFT JOIN orders o ON d.order_id = o.id
            WHERE d.id = %s AND d.rider_id = %s AND d.status IN ('assigned', 'picked_up', 'in_transit')
        """, (delivery_id, rider_id))
        
        delivery = cursor.fetchone()
        if not delivery:
            return jsonify({'error': 'Delivery not found, not assigned to you, or already completed'}), 404
        
        # Handle file upload (photo)
        photo_url = None
        if 'photo' in request.files:
            photo_file = request.files['photo']
            if photo_file and photo_file.filename:
                if allowed_file(photo_file.filename):
                    # Generate unique filename
                    filename = secure_filename(photo_file.filename)
                    unique_filename = f"delivery_{delivery_id}_{uuid.uuid4()}_{filename}"
                    filepath = os.path.join(app.config['DELIVERY_PROOF_FOLDER'], unique_filename)
                    
                    # Save photo
                    photo_file.save(filepath)
                    photo_url = f"/static/uploads/delivery_proof/{unique_filename}"
                    print(f"[PROOF] Photo saved: {photo_url}")
                else:
                    return jsonify({'error': 'Invalid photo file type'}), 400
        
        # Get form data
        signature_data = request.form.get('signature_data')  # Base64 encoded signature
        delivery_notes = request.form.get('delivery_notes', '')
        customer_present = request.form.get('customer_present', 'false').lower() == 'true'
        customer_id_verified = request.form.get('customer_id_verified', 'false').lower() == 'true'
        location_lat = request.form.get('location_lat')
        location_lng = request.form.get('location_lng')
        
        # Determine proof type
        proof_type = 'combined'
        if photo_url and signature_data:
            proof_type = 'combined'
        elif photo_url:
            proof_type = 'photo'
        elif signature_data:
            proof_type = 'signature'
        elif customer_present:
            proof_type = 'customer_confirmation'
        
        # Validate that we have at least some proof
        if not photo_url and not signature_data and not customer_present:
            return jsonify({'error': 'At least one form of delivery proof is required'}), 400
        
        # Convert location to float if provided
        lat_float = float(location_lat) if location_lat else None
        lng_float = float(location_lng) if location_lng else None
        
        # Insert delivery proof record
        cursor.execute("""
            INSERT INTO delivery_proof (
                delivery_id, order_id, rider_id, photo_url, signature_data,
                delivery_notes, customer_present, customer_id_verified,
                proof_type, location_lat, location_lng
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            delivery_id, delivery['order_id'], rider_id, photo_url, signature_data,
            delivery_notes, customer_present, customer_id_verified,
            proof_type, lat_float, lng_float
        ))
        
        proof_id = cursor.lastrowid
        
        # Update delivery status to delivered
        cursor.execute("""
            UPDATE deliveries SET 
                status = 'delivered',
                delivery_time = NOW(),
                completed_at = NOW()
                {} 
            WHERE id = %s
        """.format(
            ", actual_time = TIMESTAMPDIFF(MINUTE, pickup_time, NOW())" if delivery['pickup_time'] else ""
        ), (delivery_id,))
        
        # Update order status to delivered
        cursor.execute("""
            UPDATE orders SET status = 'delivered' 
            WHERE id = %s
        """, (delivery['order_id'],))
        
        # Update rider availability
        cursor.execute("""
            SELECT COUNT(*) as active_count FROM deliveries 
            WHERE rider_id = %s AND status IN ('assigned', 'picked_up', 'in_transit') AND id != %s
        """, (rider_id, delivery_id))
        
        active_count = cursor.fetchone()['active_count']
        
        if active_count == 0:
            cursor.execute("UPDATE users SET status = 'available' WHERE id = %s", (rider_id,))
            print(f"[RIDER-STATUS] Rider {rider_id} set to available after delivery with proof")
        
        # Create delivery completed notification
        try:
            cursor.execute("""
                SELECT o.order_number, o.buyer_id, o.full_name as customer_name
                FROM orders o WHERE o.id = %s
            """, (delivery['order_id'],))
            
            order_info = cursor.fetchone()
            
            if order_info and order_info['buyer_id']:
                cursor.execute("""
                    INSERT INTO notifications (user_id, type, message, reference_id, created_at)
                    VALUES (%s, %s, %s, %s, NOW())
                """, (
                    order_info['buyer_id'], 
                    'delivery_delivered_with_proof', 
                    f"Your order #{order_info['order_number']} has been delivered with confirmation proof", 
                    delivery['order_id']
                ))
                
                print(f"[NOTIFICATION] Created delivery completion with proof notification")
        except Exception as e:
            print(f"[NOTIFICATION] Error creating notification: {str(e)}")
        
        connection.commit()
        
        return jsonify({
            'success': True,
            'message': 'Delivery completed with proof uploaded successfully',
            'proof_id': proof_id,
            'proof_type': proof_type,
            'photo_url': photo_url
        })
        
    except Exception as e:
        connection.rollback()
        print(f"Error uploading delivery proof: {str(e)}")
        return jsonify({'error': 'Failed to upload delivery proof'}), 500
    finally:
        cursor.close()
        connection.close()

# Get delivery history
@app.route('/api/rider/deliveries/history', methods=['GET'])
@token_required
@rider_required
def get_delivery_history(current_user):
    """Get rider's delivery history"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        rider_id = current_user['id']
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 20))
        status_filter = request.args.get('status')
        date_filter = request.args.get('date')  # YYYY-MM-DD format
        
        offset = (page - 1) * limit
        
        base_query = """
            SELECT 
                d.*,
                o.order_number,
                o.full_name as customer_name,
                o.total_amount,
                dr.rating as customer_rating,
                dr.comment as customer_feedback
            FROM deliveries d
            LEFT JOIN orders o ON d.order_id = o.id
            LEFT JOIN delivery_ratings dr ON d.id = dr.delivery_id
            WHERE d.rider_id = %s AND d.status = 'delivered'
        """
        
        params = [rider_id]
        
        if date_filter:
            base_query += " AND DATE(d.completed_at) = %s"
            params.append(date_filter)
        
        # Get total count with a separate simpler query
        count_query = """
            SELECT COUNT(*) as total
            FROM deliveries d
            LEFT JOIN orders o ON d.order_id = o.id
            LEFT JOIN delivery_ratings dr ON d.id = dr.delivery_id
            WHERE d.rider_id = %s AND d.status = 'delivered'
        """
        
        count_params = [rider_id]
        if date_filter:
            count_query += " AND DATE(d.completed_at) = %s"
            count_params.append(date_filter)
        
        cursor.execute(count_query, count_params)
        count_result = cursor.fetchone()
        total = count_result['total'] if count_result else 0
        
        # Get paginated results
        base_query += " ORDER BY d.completed_at DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        cursor.execute(base_query, params)
        deliveries = cursor.fetchall()
        
        formatted_deliveries = []
        for delivery in deliveries:
            formatted_deliveries.append({
                'id': delivery['id'],
                'order_number': delivery['order_number'],
                'customer_name': delivery['customer_name'] or 'Unknown',
                'delivery_address': delivery['delivery_address'],
                'distance': float(delivery['distance']) if delivery['distance'] else 0,
                'delivery_fee': float(delivery['delivery_fee']),
                'base_fee': float(delivery['base_fee']),
                'tips': float(delivery['tips']),
                'total_earnings': float(delivery['base_fee'] + delivery['distance_bonus'] + delivery['tips'] + delivery['peak_bonus']),
                'delivery_type': delivery['delivery_type'],
                'actual_time': delivery['actual_time'],
                'customer_rating': float(delivery['customer_rating']) if delivery['customer_rating'] else None,
                'customer_feedback': delivery['customer_feedback'],
                'completed_at': delivery['completed_at'].isoformat() if delivery['completed_at'] else None
            })
        
        return jsonify({
            'success': True,
            'deliveries': formatted_deliveries,
            'pagination': {
                'current_page': page,
                'total_pages': (total + limit - 1) // limit,
                'total_records': total,
                'per_page': limit
            }
        })
        
    except Exception as e:
        print(f"Error getting delivery history: {str(e)}")
        return jsonify({'error': 'Failed to get delivery history'}), 500
    finally:
        cursor.close()
        connection.close()

# Rider availability endpoints
@app.route('/api/rider/status', methods=['GET'])
@token_required
@rider_required
def rider_get_status(current_user):
    return jsonify({'success': True, 'status': current_user.get('status') or 'offline'})

@app.route('/api/rider/status', methods=['POST'])
@token_required
@rider_required
def rider_set_status(current_user):
    data = request.get_json() or {}
    status = (data.get('status') or '').strip().lower()
    # Riders can set these states; 'busy' is system-managed
    if status not in ['available', 'offline']:
        return jsonify({'error': 'Invalid status'}), 400
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    cur = conn.cursor()
    try:
        cur.execute("UPDATE users SET status = %s WHERE id = %s", (status, current_user['id']))
        conn.commit()
        return jsonify({'success': True, 'status': status})
    except Exception as e:
        conn.rollback()
         # keep response generic
        return jsonify({'error': 'Failed to update status'}), 500
    finally:
        cur.close(); conn.close()

# Get rider earnings
@app.route('/api/rider/earnings', methods=['GET'])
@token_required
@rider_required
def get_rider_earnings(current_user):
    """Get rider earnings data"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        rider_id = current_user['id']
        
        # Today's earnings
        cursor.execute("""
            SELECT COALESCE(SUM(base_fee + distance_bonus + tips + peak_bonus), 0) as amount
            FROM deliveries 
            WHERE rider_id = %s AND DATE(completed_at) = CURDATE() AND status = 'delivered'
        """, (rider_id,))
        today = float(cursor.fetchone()['amount'] or 0)
        
        # This week's earnings
        cursor.execute("""
            SELECT COALESCE(SUM(base_fee + distance_bonus + tips + peak_bonus), 0) as amount
            FROM deliveries 
            WHERE rider_id = %s 
            AND WEEK(completed_at) = WEEK(CURDATE()) 
            AND YEAR(completed_at) = YEAR(CURDATE())
            AND status = 'delivered'
        """, (rider_id,))
        week = float(cursor.fetchone()['amount'] or 0)
        
        # This month's earnings
        cursor.execute("""
            SELECT COALESCE(SUM(base_fee + distance_bonus + tips + peak_bonus), 0) as amount
            FROM deliveries 
            WHERE rider_id = %s 
            AND MONTH(completed_at) = MONTH(CURDATE()) 
            AND YEAR(completed_at) = YEAR(CURDATE())
            AND status = 'delivered'
        """, (rider_id,))
        month = float(cursor.fetchone()['amount'] or 0)
        
        # Total earnings
        cursor.execute("""
            SELECT COALESCE(SUM(base_fee + distance_bonus + tips + peak_bonus), 0) as amount
            FROM deliveries 
            WHERE rider_id = %s AND status = 'delivered'
        """, (rider_id,))
        total = float(cursor.fetchone()['amount'] or 0)
        
        # Earnings breakdown for current month
        cursor.execute("""
            SELECT 
                COALESCE(SUM(base_fee), 0) as base_fee,
                COALESCE(SUM(distance_bonus), 0) as distance_bonus,
                COALESCE(SUM(tips), 0) as tips,
                COALESCE(SUM(peak_bonus), 0) as peak_bonus
            FROM deliveries 
            WHERE rider_id = %s 
            AND MONTH(completed_at) = MONTH(CURDATE()) 
            AND YEAR(completed_at) = YEAR(CURDATE())
            AND status = 'delivered'
        """, (rider_id,))
        breakdown = cursor.fetchone()
        
        # Daily trend for last 7 days
        cursor.execute("""
            SELECT 
                DATE(completed_at) as date,
                COALESCE(SUM(base_fee + distance_bonus + tips + peak_bonus), 0) as amount
            FROM deliveries 
            WHERE rider_id = %s 
            AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            AND status = 'delivered'
            GROUP BY DATE(completed_at)
            ORDER BY date
        """, (rider_id,))
        daily_trend = cursor.fetchall()
        
        return jsonify({
            'success': True,
            'today': today,
            'week': week,
            'month': month,
            'total': total,
            'breakdown': {
                'base_fee': float(breakdown['base_fee'] or 0),
                'distance_bonus': float(breakdown['distance_bonus'] or 0),
                'tips': float(breakdown['tips'] or 0),
                'peak_bonus': float(breakdown['peak_bonus'] or 0)
            },
            'daily_trend': [
                {
                    'date': trend['date'].isoformat() if trend['date'] else None,
                    'amount': float(trend['amount'] or 0)
                } for trend in daily_trend
            ]
        })
        
    except Exception as e:
        print(f"Error getting rider earnings: {str(e)}")
        return jsonify({'error': 'Failed to get earnings data'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/rider/earnings-report', methods=['GET'])
@token_required
@rider_required
def get_rider_earnings_report(current_user):
    """Get rider earnings report with daily breakdown"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        rider_id = current_user['id']
        date_from = request.args.get('from')
        date_to = request.args.get('to')
        
        if not date_from or not date_to:
            return jsonify({'error': 'Date range is required'}), 400
        
        # Get daily earnings breakdown with seller/buyer information
        cursor.execute("""
            SELECT 
                DATE(d.completed_at) as date,
                COUNT(*) as delivery_count,
                COALESCE(SUM(d.base_fee), 0) as base_fee,
                COALESCE(SUM(d.base_fee), 0) as total_earnings,
                GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ') as sellers,
                GROUP_CONCAT(DISTINCT b.name ORDER BY b.name SEPARATOR ', ') as buyers
            FROM deliveries d
            LEFT JOIN orders o ON d.order_id = o.id
            LEFT JOIN users s ON o.seller_id = s.id
            LEFT JOIN users b ON o.buyer_id = b.id
            WHERE d.rider_id = %s 
            AND DATE(d.completed_at) >= %s
            AND DATE(d.completed_at) <= %s
            AND d.status = 'delivered'
            GROUP BY DATE(d.completed_at)
            ORDER BY date ASC
        """, (rider_id, date_from, date_to))
        
        daily_earnings = cursor.fetchall()
        
        return jsonify({
            'success': True,
            'daily_earnings': [
                {
                    'date': earning['date'].isoformat() if earning['date'] else None,
                    'delivery_count': earning['delivery_count'] or 0,
                    'base_fee': float(earning['base_fee'] or 0),
                    'total_earnings': float(earning['total_earnings'] or 0),
                    'sellers': earning['sellers'] or 'N/A',
                    'buyers': earning['buyers'] or 'N/A'
                } for earning in daily_earnings
            ]
        })
        
    except Exception as e:
        print(f"Error getting rider earnings report: {str(e)}")
        return jsonify({'error': 'Failed to get earnings report'}), 500
    finally:
        cursor.close()
        connection.close()

# Get seller delivery tracking information
@app.route('/api/seller/deliveries', methods=['GET'])
@token_required
def get_seller_deliveries(current_user):
    """Get seller's orders with delivery information"""
    # Verify seller role
    if current_user['role'] != 'seller':
        return jsonify({'error': 'Seller access required'}), 403
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        seller_id = current_user['id']
        status_filter = request.args.get('status')  # Optional status filter
        
        base_query = """
            SELECT 
                o.id,
                o.order_number,
                o.full_name as customer_name,
                o.email as customer_email,
                o.total_amount,
                o.status as order_status,
                o.created_at,
                o.special_notes,
                d.id as delivery_id,
                d.status as delivery_status,
                d.delivery_address,
                d.delivery_fee,
                d.assigned_at,
                d.pickup_time,
                d.delivery_time,
                r.name as rider_name,
                r.phone as rider_phone,
                u.phone as customer_phone
            FROM orders o
            LEFT JOIN deliveries d ON o.id = d.order_id
            LEFT JOIN users r ON d.rider_id = r.id
            LEFT JOIN users u ON o.buyer_id = u.id
            WHERE o.seller_id = %s
            AND o.status IN ('confirmed', 'prepared', 'shipped')
        """
        
        params = [seller_id]
        
        if status_filter:
            base_query += " AND d.status = %s"
            params.append(status_filter)
        
        base_query += " ORDER BY o.created_at DESC"
        
        cursor.execute(base_query, params)
        orders = cursor.fetchall()
        
        formatted_deliveries = []
        for order in orders:
            # Determine the effective delivery status
            delivery_status = order['delivery_status'] or 'pending'
            
            formatted_deliveries.append({
                'id': order['id'],
                'order_number': order['order_number'],
                'customer_name': order['customer_name'] or 'Unknown',
                'customer_email': order['customer_email'],
                'customer_phone': order['customer_phone'],
                'rider_name': order['rider_name'],
                'rider_phone': order['rider_phone'],
                'status': order['order_status'],
                'delivery_status': delivery_status,
                'delivery_address': order['delivery_address'] or f"{order['customer_name']}'s Address",
                'delivery_fee': float(order['delivery_fee']) if order['delivery_fee'] else 0,
                'total_amount': float(order['total_amount']),
                'created_at': order['created_at'].isoformat() if order['created_at'] else None,
                'assigned_at': order['assigned_at'].isoformat() if order['assigned_at'] else None,
                'pickup_time': order['pickup_time'].isoformat() if order['pickup_time'] else None,
                'delivery_time': order['delivery_time'].isoformat() if order['delivery_time'] else None,
                'special_notes': order.get('special_notes')
            })
        
        return jsonify({
            'success': True,
            'deliveries': formatted_deliveries,
            'total': len(formatted_deliveries)
        })
        
    except Exception as e:
        print(f"Error getting seller deliveries: {str(e)}")
        return jsonify({'error': 'Failed to get deliveries'}), 500
    finally:
        cursor.close()
        connection.close()

# Get rider payments
@app.route('/api/rider/payments', methods=['GET'])
@token_required
@rider_required
def get_rider_payments(current_user):
    """Get rider payment history"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        rider_id = current_user['id']
        
        cursor.execute("""
            SELECT * FROM rider_payments 
            WHERE rider_id = %s 
            ORDER BY created_at DESC
        """, (rider_id,))
        
        payments = cursor.fetchall()
        
        formatted_payments = []
        for payment in payments:
            formatted_payments.append({
                'id': payment['id'],
                'amount': float(payment['amount']),
                'period_start': payment['period_start'].isoformat() if payment['period_start'] else None,
                'period_end': payment['period_end'].isoformat() if payment['period_end'] else None,
                'deliveries_count': payment['deliveries_count'],
                'payment_method': payment['payment_method'],
                'status': payment['status'],
                'reference_number': payment['reference_number'],
                'created_at': payment['created_at'].isoformat() if payment['created_at'] else None,
                'processed_at': payment['processed_at'].isoformat() if payment['processed_at'] else None
            })
        
        return jsonify({
            'success': True,
            'payments': formatted_payments
        })
        
    except Exception as e:
        print(f"Error getting rider payments: {str(e)}")
        return jsonify({'error': 'Failed to get payment data'}), 500
    finally:
        cursor.close()
        connection.close()

# Get rider performance
@app.route('/api/rider/performance', methods=['GET'])
@token_required
@rider_required
def get_rider_performance(current_user):
    """Get rider performance metrics"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        rider_id = current_user['id']
        
        # Average rating
        cursor.execute("""
            SELECT AVG(rating) as avg_rating
            FROM delivery_ratings
            WHERE rider_id = %s
        """, (rider_id,))
        rating_result = cursor.fetchone()
        average_rating = float(rating_result['avg_rating'] or 0)
        
        # Average delivery time
        cursor.execute("""
            SELECT AVG(actual_time) as avg_time
            FROM deliveries
            WHERE rider_id = %s AND status = 'delivered' AND actual_time > 0
        """, (rider_id,))
        time_result = cursor.fetchone()
        average_delivery_time = int(time_result['avg_time'] or 0)
        
        # Success rate
        cursor.execute("""
            SELECT 
                COUNT(*) as total_assignments,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as completed
            FROM deliveries
            WHERE rider_id = %s AND status IN ('delivered', 'cancelled')
        """, (rider_id,))
        success_result = cursor.fetchone()
        total_assignments = success_result['total_assignments'] or 0
        completed = success_result['completed'] or 0
        success_rate = (completed / total_assignments * 100) if total_assignments > 0 else 0
        
        # Total distance this month
        cursor.execute("""
            SELECT COALESCE(SUM(distance), 0) as total_distance
            FROM deliveries
            WHERE rider_id = %s 
            AND MONTH(completed_at) = MONTH(CURDATE()) 
            AND YEAR(completed_at) = YEAR(CURDATE())
            AND status = 'delivered'
        """, (rider_id,))
        distance_result = cursor.fetchone()
        total_distance = float(distance_result['total_distance'] or 0)
        
        # Delivery type distribution
        cursor.execute("""
            SELECT 
                delivery_type,
                COUNT(*) as count
            FROM deliveries
            WHERE rider_id = %s AND status = 'delivered'
            GROUP BY delivery_type
        """, (rider_id,))
        type_distribution = cursor.fetchall()
        
        distribution = {
            'standard': 0,
            'express': 0,
            'same_day': 0,
            'scheduled': 0
        }
        
        for item in type_distribution:
            if item['delivery_type'] in distribution:
                distribution[item['delivery_type']] = item['count']
        
        # Performance trends (last 7 days)
        performance_trends = {
            'delivery-time': [],
            'success-rate': [],
            'ratings': []
        }
        
        # Get daily performance for last 7 days
        for i in range(7):
            date_offset = 6 - i
            cursor.execute("""
                SELECT 
                    AVG(actual_time) as avg_time,
                    AVG(dr.rating) as avg_rating,
                    COUNT(d.id) as total,
                    SUM(CASE WHEN d.status = 'delivered' THEN 1 ELSE 0 END) as completed
                FROM deliveries d
                LEFT JOIN delivery_ratings dr ON d.id = dr.delivery_id
                WHERE d.rider_id = %s 
                AND DATE(d.created_at) = DATE_SUB(CURDATE(), INTERVAL %s DAY)
            """, (rider_id, date_offset))
            
            day_result = cursor.fetchone()
            date_str = f'2024-01-{8-date_offset:02d}'  # Simplified date for demo
            
            performance_trends['delivery-time'].append({
                'date': date_str,
                'value': int(day_result['avg_time'] or 30)  # Default 30 min if no data
            })
            
            day_success_rate = ((day_result['completed'] or 0) / (day_result['total'] or 1)) * 100
            performance_trends['success-rate'].append({
                'date': date_str,
                'value': day_success_rate
            })
            
            performance_trends['ratings'].append({
                'date': date_str,
                'value': float(day_result['avg_rating'] or 4.5)  # Default 4.5 if no data
            })
        
        return jsonify({
            'success': True,
            'average_rating': average_rating,
            'average_delivery_time': average_delivery_time,
            'success_rate': success_rate,
            'total_distance': total_distance,
            'delivery_distribution': distribution,
            'performance_trends': performance_trends
        })
        
    except Exception as e:
        print(f"Error getting rider performance: {str(e)}")
        return jsonify({'error': 'Failed to get performance data'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/admin/deliveries', methods=['GET'])
@token_required
def get_admin_deliveries(current_user):
    """Admin view of all deliveries with rider assignments"""
    if current_user.get('role') not in ['admin', 'seller']:
        return jsonify({'error': 'Admin access required'}), 403
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        status_filter = request.args.get('status', 'all')
        
        base_query = """
            SELECT 
                d.*,
                o.order_number,
                o.full_name as customer_name,
                o.total_amount,
                o.seller_id,
                u_rider.name as rider_name,
                u_rider.phone as rider_phone,
                u_customer.name as customer_name_alt,
                u_customer.phone as customer_phone,
                u_seller.name as seller_name,
                u_seller.phone as seller_phone,
                u_seller.address as seller_address_json,
                -- Buyer delivery address from user_addresses
                (
                    SELECT CONCAT_WS(', ',
                        NULLIF(ua.street, ''),
                        NULLIF(ua.barangay, ''),
                        NULLIF(ua.city, ''),
                        NULLIF(ua.province, ''),
                        NULLIF(ua.region, '')
                    )
                    FROM user_addresses ua 
                    WHERE ua.user_id = o.buyer_id 
                    ORDER BY ua.is_default DESC, ua.updated_at DESC 
                    LIMIT 1
                ) as buyer_delivery_address
            FROM deliveries d
            LEFT JOIN orders o ON d.order_id = o.id
            LEFT JOIN users u_rider ON d.rider_id = u_rider.id
            LEFT JOIN users u_customer ON o.buyer_id = u_customer.id
            LEFT JOIN users u_seller ON o.seller_id = u_seller.id
        """
        
        where_clause = ""
        params = []
        
        if status_filter != 'all':
            where_clause = " WHERE d.status = %s"
            params.append(status_filter)
        
        query = base_query + where_clause + " ORDER BY d.created_at DESC"
        cursor.execute(query, params)
        
        deliveries = cursor.fetchall()
        
        formatted_deliveries = []
        for delivery in deliveries:
            # Safely convert numeric fields
            try:
                delivery_fee = float(delivery.get('delivery_fee') or 0)
            except (TypeError, ValueError):
                delivery_fee = 0.0
            try:
                distance = float(delivery.get('distance') or 0)
            except (TypeError, ValueError):
                distance = 0.0
            try:
                order_total = float(delivery.get('total_amount') or 0)
            except (TypeError, ValueError):
                order_total = 0.0

            # Get seller business address from users.address (primary source)
            # Parse the JSON address from users table
            seller_business_address = 'Seller address not available'
            seller_address_json = delivery.get('seller_address_json')
            
            if seller_address_json:
                try:
                    if isinstance(seller_address_json, str):
                        if seller_address_json.startswith('{'):
                            address_data = json.loads(seller_address_json)
                        else:
                            # Plain string address
                            seller_business_address = seller_address_json
                            address_data = None
                    elif isinstance(seller_address_json, dict):
                        address_data = seller_address_json
                    else:
                        address_data = {}
                    
                    # Build address from JSON components
                    if address_data:
                        address_parts = []
                        if address_data.get('street'): address_parts.append(address_data['street'])
                        if address_data.get('barangay'): address_parts.append(address_data['barangay'])
                        if address_data.get('city'): address_parts.append(address_data['city'])
                        if address_data.get('province'): address_parts.append(address_data['province'])
                        if address_data.get('region'): address_parts.append(address_data['region'])
                        
                        if address_parts:
                            seller_business_address = ', '.join([p for p in address_parts if p.strip()])
                        elif address_data.get('address'):
                            seller_business_address = address_data['address']
                except Exception as e:
                    print(f"[ADMIN-DELIVERIES] Error parsing seller address JSON: {e}")
                    # Fallback to plain string if JSON parsing fails
                    if isinstance(seller_address_json, str) and not seller_address_json.startswith('{'):
                        seller_business_address = seller_address_json
            
            # Replace old hardcoded values - ignore stored pickup_address if it's the old value
            stored_pickup = delivery.get('pickup_address') or ''
            if stored_pickup == "Grande Store, Main Branch":
                # Already using seller_business_address from users.address
                pass
            elif seller_business_address == "Seller address not available" and stored_pickup and stored_pickup != "Seller address not available":
                # Only use stored pickup_address as fallback if it's valid
                seller_business_address = stored_pickup
            
            # Get buyer delivery address (prefer from user_addresses, fallback to delivery_address)
            buyer_delivery_address = delivery.get('buyer_delivery_address') or delivery.get('delivery_address') or 'N/A'

            formatted_deliveries.append({
                'id': delivery['id'],
                'order_number': delivery['order_number'],
                'customer_name': delivery['customer_name'] or delivery['customer_name_alt'] or 'Unknown',
                'customer_phone': delivery.get('customer_phone'),
                'rider_id': delivery.get('rider_id'),
                'rider_name': delivery['rider_name'] or 'Unassigned',
                'rider_phone': delivery['rider_phone'],
                'seller_name': delivery.get('seller_name') or 'N/A',
                'seller_phone': delivery.get('seller_phone'),
                'seller_business_address': seller_business_address,
                'delivery_address': buyer_delivery_address,
                'pickup_address': seller_business_address,  # Keep for backward compatibility
                'status': delivery['status'],
                'delivery_fee': delivery_fee,
                'order_total': order_total,
                'distance': distance,
                'estimated_time': delivery['estimated_time'],
                'actual_time': delivery['actual_time'],
                'delivery_type': delivery['delivery_type'],
                'priority': delivery['priority'],
                'created_at': delivery['created_at'].isoformat() if delivery['created_at'] else None,
                'assigned_at': delivery['assigned_at'].isoformat() if delivery['assigned_at'] else None,
                'completed_at': delivery['completed_at'].isoformat() if delivery['completed_at'] else None,
                'updated_at': delivery['updated_at'].isoformat() if delivery.get('updated_at') else None
            })
        
        return jsonify({
            'success': True,
            'deliveries': formatted_deliveries,
            'total': len(formatted_deliveries)
        })
        
    except Exception as e:
        print(f"Error getting admin deliveries: {str(e)}")
        return jsonify({'error': 'Failed to get deliveries'}), 500
    finally:
        cursor.close()
        connection.close()

# Admin: Override rider assignment
@app.route('/api/admin/deliveries/<int:delivery_id>/assign', methods=['PUT'])
@token_required
def admin_assign_rider(current_user, delivery_id):
    """Admin override: manually assign or reassign rider to delivery"""
    if current_user.get('role') not in ['admin', 'seller']:
        return jsonify({'error': 'Admin access required'}), 403
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        data = request.get_json()
        new_rider_id = data.get('rider_id')
        
        if not new_rider_id:
            return jsonify({'error': 'Rider ID is required'}), 400
        
        # Verify rider exists and is active
        cursor.execute("""
            SELECT id, name, status FROM users 
            WHERE id = %s AND role = 'rider' AND is_active = 1
        """, (new_rider_id,))
        
        rider = cursor.fetchone()
        if not rider:
            return jsonify({'error': 'Rider not found or inactive'}), 404
        
        # Get current delivery info
        cursor.execute("""
            SELECT d.*, o.order_number, u.name as current_rider_name
            FROM deliveries d
            LEFT JOIN orders o ON d.order_id = o.id
            LEFT JOIN users u ON d.rider_id = u.id
            WHERE d.id = %s
        """, (delivery_id,))
        
        delivery = cursor.fetchone()
        if not delivery:
            return jsonify({'error': 'Delivery not found'}), 404
        
        old_rider_id = delivery['rider_id']
        
        # Update delivery assignment
        cursor.execute("""
            UPDATE deliveries 
            SET rider_id = %s, status = 'assigned', assigned_at = NOW() 
            WHERE id = %s
        """, (new_rider_id, delivery_id))
        
        # Update order status if needed
        cursor.execute("""
            UPDATE orders 
            SET rider_id = %s, status = 'accepted_by_rider' 
            WHERE id = %s
        """, (new_rider_id, delivery['order_id']))
        
        # Update rider statuses
        cursor.execute("UPDATE users SET status = 'busy' WHERE id = %s", (new_rider_id,))
        
        if old_rider_id:
            # Check if old rider has other active deliveries
            cursor.execute("""
                SELECT COUNT(*) as active_count FROM deliveries 
                WHERE rider_id = %s AND status IN ('assigned', 'picked_up', 'in_transit')
            """, (old_rider_id,))
            active_count = cursor.fetchone()['active_count']
            
            if active_count == 0:
                cursor.execute("UPDATE users SET status = 'available' WHERE id = %s", (old_rider_id,))
        
        connection.commit()
        
        print(f"[ADMIN-OVERRIDE] Delivery {delivery_id} reassigned from rider {old_rider_id or 'None'} to {rider['name']} by admin {current_user['id']}")
        
        return jsonify({
            'success': True,
            'message': f'Delivery assigned to {rider["name"]}',
            'delivery_id': delivery_id,
            'rider_name': rider['name'],
            'order_number': delivery['order_number']
        })
        
    except Exception as e:
        connection.rollback()
        print(f"Error in admin rider assignment: {str(e)}")
        return jsonify({'error': 'Failed to assign rider'}), 500
    finally:
        cursor.close()
        connection.close()

# Admin: Get available riders for assignment
@app.route('/api/admin/riders/available', methods=['GET'])
@token_required
def get_available_riders_admin(current_user):
    """Get list of available riders for admin assignment"""
    if current_user.get('role') not in ['admin', 'seller']:
        return jsonify({'error': 'Admin access required'}), 403
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        cursor.execute("""
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.status,
                u.location_lat,
                u.location_lng,
                COUNT(d.id) as active_deliveries
            FROM users u
            LEFT JOIN deliveries d ON u.id = d.rider_id AND d.status IN ('assigned', 'picked_up', 'in_transit')
            WHERE u.role = 'rider' AND u.is_active = 1
            GROUP BY u.id
            ORDER BY u.status, u.name
        """)
        
        riders = cursor.fetchall()
        
        formatted_riders = []
        for rider in riders:
            formatted_riders.append({
                'id': rider['id'],
                'name': rider['name'],
                'email': rider['email'],
                'phone': rider['phone'],
                'status': rider['status'],
                'active_deliveries': rider['active_deliveries'],
                'location': {
                    'lat': float(rider['location_lat']) if rider['location_lat'] else None,
                    'lng': float(rider['location_lng']) if rider['location_lng'] else None
                }
            })
        
        return jsonify({
            'success': True,
            'riders': formatted_riders
        })
        
    except Exception as e:
        print(f"Error getting available riders: {str(e)}")
        return jsonify({'error': 'Failed to get riders'}), 500
    finally:
        cursor.close()
        connection.close()

# Admin: Create chat with rider
@app.route('/api/admin/chats/create-with-rider', methods=['POST'])
@token_required
def admin_create_chat_with_rider(current_user):
    """Admin convenience endpoint to create or get existing chat with a rider"""
    if current_user.get('role') not in ['admin']:
        return jsonify({'error': 'Admin access required'}), 403
    
    data = request.get_json() or {}
    rider_id = data.get('rider_id')
    order_number = (data.get('order_number') or '').strip()
    message = (data.get('message') or '').strip()
    
    if not rider_id:
        return jsonify({'error': 'rider_id is required'}), 400
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    try:
        # Verify rider exists
        cursor.execute("SELECT id, name FROM users WHERE id = %s AND role = 'rider'", (rider_id,))
        rider = cursor.fetchone()
        if not rider:
            return jsonify({'error': 'Rider not found'}), 404
        
        # Get order if order_number provided
        order_id = None
        if order_number:
            cursor.execute("SELECT id FROM orders WHERE order_number = %s", (order_number,))
            order = cursor.fetchone()
            if order:
                order_id = order['id']
        
        # Check if chat conversation already exists (admin-rider chat)
        cursor.execute("""
            SELECT id FROM chat_conversations
            WHERE admin_id = %s AND rider_id = %s
            AND (order_id = %s OR (%s IS NULL AND order_id IS NULL))
        """, (current_user['id'], rider_id, order_id, order_id))
        existing_chat = cursor.fetchone()
        
        if existing_chat:
            conversation_id = existing_chat['id']
        else:
            # Create new conversation (admin-rider chat doesn't need buyer_id)
            # Try with NULL buyer_id first, if that fails due to constraint, use a workaround
            try:
                cursor.execute("""
                    INSERT INTO chat_conversations (admin_id, rider_id, order_id, order_number, participant_name, buyer_id)
                    VALUES (%s, %s, %s, %s, %s, NULL)
                """, (current_user['id'], rider_id, order_id, order_number, rider['name']))
                conversation_id = cursor.lastrowid
            except Exception as insert_error:
                error_msg = str(insert_error)
                if 'buyer_id' in error_msg and 'cannot be null' in error_msg.lower():
                    # buyer_id is still NOT NULL - need to use a workaround
                    # Use admin's own ID as buyer_id (workaround for constraint)
                    print(f"[CHAT] buyer_id constraint issue detected, using workaround")
                    cursor.execute("""
                        INSERT INTO chat_conversations (admin_id, rider_id, order_id, order_number, participant_name, buyer_id, seller_id)
                        VALUES (%s, %s, %s, %s, %s, %s, NULL)
                    """, (current_user['id'], rider_id, order_id, order_number, rider['name'], current_user['id']))
                    conversation_id = cursor.lastrowid
                else:
                    raise insert_error
        
        # Send initial message if provided (optional - don't require it)
        if message:
            try:
                cursor.execute("""
                    INSERT INTO chat_messages (conversation_id, sender_id, sender_type, content)
                    VALUES (%s, %s, 'admin', %s)
                """, (conversation_id, current_user['id'], message))
                
                # Update last message time
                cursor.execute("UPDATE chat_conversations SET last_message_time = NOW() WHERE id = %s", (conversation_id,))
                
                # Create notification for rider
                notification_message = f"New message from admin: {message[:50]}{'...' if len(message) > 50 else ''}"
                cursor.execute("""
                    INSERT INTO notifications (user_id, type, message, reference_id)
                    VALUES (%s, 'chat_message', %s, %s)
                """, (rider_id, notification_message, conversation_id))
            except Exception as e:
                print(f"Error sending initial message: {e}")
                # Don't fail the whole request if message sending fails
        
        connection.commit()
        return jsonify({
            'success': True,
            'chat_id': conversation_id,
            'rider_name': rider['name']
        })
        
    except Exception as e:
        connection.rollback()
        print(f"Error creating admin-rider chat: {e}")
        return jsonify({'error': 'Failed to create chat'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/chats/create-with-admin', methods=['POST'])
@token_required
def create_chat_with_admin(current_user):
    """Universal endpoint for buyer, seller, or rider to create admin chat with order context"""
    data = request.get_json() or {}
    order_id = data.get('order_id')
    order_number = data.get('order_number')
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    try:
        user_role = current_user.get('role')
        user_id = current_user['id']
        user_name = current_user.get('name', 'User')
        
        # Get order_id if order_number provided
        if order_number and not order_id:
            cursor.execute("SELECT id FROM orders WHERE order_number = %s", (order_number,))
            order_row = cursor.fetchone()
            if order_row:
                order_id = order_row['id']
        
        # Find an available admin
        cursor.execute("SELECT id, name FROM users WHERE role = 'admin' AND status = 'active' LIMIT 1")
        admin = cursor.fetchone()
        if not admin:
            return jsonify({'error': 'No admin available'}), 404
        
        # Determine which field to use based on user role
        buyer_id = None
        seller_id = None
        rider_id = None
        
        if user_role == 'buyer':
            buyer_id = user_id
        elif user_role == 'seller':
            seller_id = user_id
        elif user_role == 'rider':
            rider_id = user_id
        else:
            return jsonify({'error': 'Only buyers, sellers, and riders can chat with admin'}), 403
        
        # Check if conversation already exists (with order_id if provided)
        check_query = """
            SELECT id FROM chat_conversations 
            WHERE admin_id = %s
        """
        check_params = [admin['id']]
        
        if buyer_id:
            check_query += " AND buyer_id = %s"
            check_params.append(buyer_id)
        if seller_id:
            check_query += " AND seller_id = %s"
            check_params.append(seller_id)
        if rider_id:
            check_query += " AND rider_id = %s"
            check_params.append(rider_id)
        
        if order_id:
            check_query += " AND order_id = %s"
            check_params.append(order_id)
        else:
            check_query += " AND order_id IS NULL"
        
        cursor.execute(check_query, check_params)
        existing = cursor.fetchone()
        
        if existing:
            chat_id = existing['id']
            # Send initial message with order context if order_id provided and no messages exist
            if order_id:
                cursor.execute("SELECT COUNT(*) as count FROM chat_messages WHERE conversation_id = %s", (chat_id,))
                msg_count = cursor.fetchone()['count']
                if msg_count == 0:
                    initial_message = f"Hello, I need assistance with Order #{order_number or order_id}. I'm the {user_role.title()}."
                    cursor.execute("""
                        INSERT INTO chat_messages (conversation_id, sender_id, sender_type, content, created_at)
                        VALUES (%s, %s, %s, %s, NOW())
                    """, (chat_id, user_id, user_role, initial_message))
                    cursor.execute("UPDATE chat_conversations SET last_message_time = NOW() WHERE id = %s", (chat_id,))
                    connection.commit()
            return jsonify({'success': True, 'chat': {'id': chat_id}})
        
        # Create admin conversation
        insert_query = """
            INSERT INTO chat_conversations (admin_id, participant_name, status, order_id, order_number, created_at
        """
        insert_values = [admin['id'], admin['name'] or 'Admin', 'active', order_id, order_number]
        insert_params = ["%s", "%s", "%s", "%s", "%s"]
        
        if buyer_id:
            insert_query += ", buyer_id"
            insert_params.append("%s")
            insert_values.append(buyer_id)
        if seller_id:
            insert_query += ", seller_id"
            insert_params.append("%s")
            insert_values.append(seller_id)
        if rider_id:
            insert_query += ", rider_id"
            insert_params.append("%s")
            insert_values.append(rider_id)
        
        insert_query += ") VALUES (" + ", ".join(insert_params) + ")"
        
        cursor.execute(insert_query, insert_values)
        chat_id = cursor.lastrowid
        
        # Send initial message with order context if order_id provided
        if order_id:
            initial_message = f"Hello, I need assistance with Order #{order_number or order_id}. I'm the {user_role.title()}."
            cursor.execute("""
                INSERT INTO chat_messages (conversation_id, sender_id, sender_type, content, created_at)
                VALUES (%s, %s, %s, %s, NOW())
            """, (chat_id, user_id, user_role, initial_message))
            cursor.execute("UPDATE chat_conversations SET last_message_time = NOW() WHERE id = %s", (chat_id,))
        
        connection.commit()
        return jsonify({'success': True, 'chat_id': chat_id, 'chat': {'id': chat_id}})
        
    except Exception as e:
        connection.rollback()
        print(f"Error creating admin chat: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to create admin chat'}), 500
    finally:
        cursor.close()
        connection.close()

@token_required
def manage_chats(current_user):
    """Get or create chat conversations"""
    if request.method == 'GET':
        return get_chat_conversations(current_user)
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        data = request.get_json()
        order_number = data.get('order_number')
        participant_name = data.get('participant_name')
        
        if not participant_name:
            return jsonify({'error': 'Participant name is required'}), 400
        
        order_id = None
        buyer_id = None
        seller_id = None
        
        if order_number:
            cursor.execute("""
                SELECT id, buyer_id, seller_id 
                FROM orders 
                WHERE order_number = %s
            """, (order_number,))
            
            order = cursor.fetchone()
            if order:
                order_id = order['id']
                buyer_id = order['buyer_id']
                seller_id = order['seller_id']
        
        if current_user['role'] == 'seller':
            seller_id = current_user['id']
            if not buyer_id:
                return jsonify({'error': 'Cannot create chat without order context'}), 400
        else:
            buyer_id = current_user['id']
            if not seller_id:
                return jsonify({'error': 'Cannot create chat without seller context'}), 400
        
        check_query = """
            SELECT id FROM chat_conversations 
            WHERE seller_id = %s AND buyer_id = %s
        """
        check_params = [seller_id, buyer_id]
        
        if order_id:
            check_query += " AND order_id = %s"
            check_params.append(order_id)
        
        cursor.execute(check_query, check_params)
        existing = cursor.fetchone()
        
        if existing:
            return jsonify({
                'success': True,
                'chat': {'id': existing['id']},
                'message': 'Conversation already exists'
            })
        
        cursor.execute("""
            INSERT INTO chat_conversations 
            (order_id, order_number, seller_id, buyer_id, participant_name)
            VALUES (%s, %s, %s, %s, %s)
        """, (order_id, order_number, seller_id, buyer_id, participant_name))
        
        conversation_id = cursor.lastrowid
        connection.commit()
        
        return jsonify({
            'success': True,
            'chat': {'id': conversation_id},
            'message': 'Conversation created successfully'
        })
        
    except Exception as e:
        connection.rollback()
        print(f"Error creating chat conversation: {str(e)}")
        return jsonify({'error': 'Failed to create conversation'}), 500
    finally:
        cursor.close()
        connection.close()

# Create or find a conversation with the seller for a given order, then send first message
@app.route('/api/chats/create-with-seller', methods=['POST'])
@token_required
def create_chat_with_seller(current_user):
    """Buyer convenience endpoint used by My Orders page.
    Body: { order_number: str, message: str }
    Finds the order owned by the current user, ensures a chat conversation exists,
    then sends the initial message in that conversation.
    """
    # Only buyers/users can use this endpoint
    if current_user.get('role') not in ['buyer', 'user']:
        return jsonify({'error': 'Only buyers can start this conversation'}), 403

    data = request.get_json() or {}
    order_number = (data.get('order_number') or '').strip()
    message = (data.get('message') or '').strip()
    if not order_number or not message:
        return jsonify({'error': 'order_number and message are required'}), 400

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = connection.cursor(dictionary=True)
    try:
        # Verify order belongs to current user and get seller
        cursor.execute("""
            SELECT id, seller_id, buyer_id
            FROM orders
            WHERE order_number = %s AND buyer_id = %s
        """, (order_number, current_user['id']))
        order = cursor.fetchone()
        if not order:
            return jsonify({'error': 'Order not found'}), 404

        order_id = order['id']
        seller_id = order['seller_id']
        buyer_id = order['buyer_id']

        # Ensure conversation exists (unique by order_id+sellers+buyer)
        cursor.execute("""
            SELECT id FROM chat_conversations
            WHERE order_id = %s AND seller_id = %s AND buyer_id = %s
        """, (order_id, seller_id, buyer_id))
        row = cursor.fetchone()
        if row:
            conversation_id = row['id']
        else:
            # Use seller name as participant_name for display (fallback to 'Seller')
            cursor.execute("SELECT name FROM users WHERE id = %s", (seller_id,))
            seller_row = cursor.fetchone()
            participant_name = seller_row['name'] if seller_row and 'name' in seller_row else 'Seller'
            cursor.execute("""
                INSERT INTO chat_conversations (order_id, order_number, seller_id, buyer_id, participant_name)
                VALUES (%s, %s, %s, %s, %s)
            """, (order_id, order_number, seller_id, buyer_id, participant_name))
            conversation_id = cursor.lastrowid

        # Insert the message from buyer
        cursor.execute("""
            INSERT INTO chat_messages (conversation_id, sender_id, sender_type, content)
            VALUES (%s, %s, 'buyer', %s)
        """, (conversation_id, current_user['id'], message))

        # Update last message time
        cursor.execute("UPDATE chat_conversations SET last_message_time = NOW() WHERE id = %s", (conversation_id))

        # Create notification for the seller about the new message
        notification_message = f"New message from buyer: {message[:50]}{'...' if len(message) > 50 else ''}"
        cursor.execute("""
            INSERT INTO notifications (user_id, type, message, reference_id)
            VALUES (%s, 'chat_message', %s, %s)
        """, (seller_id, notification_message, conversation_id))

        connection.commit()
        return jsonify({'success': True, 'chat_id': conversation_id})
    except Exception as e:
        connection.rollback()
        print(f"Error create-with-seller: {e}")
        return jsonify({'error': 'Failed to send message'}), 500
    finally:
        cursor.close()
        connection.close()

# Get chat messages
@app.route('/api/chats/<int:chat_id>/messages', methods=['GET'])
@token_required
def get_chat_messages(current_user, chat_id):
    """Get messages for a specific chat conversation"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Verify user has access to this conversation
        # Only buyers, sellers, and admins who are participants can access
        if current_user['role'] == 'rider':
            return jsonify({'error': 'Riders should use /api/rider/messages/{conversation_id}'}), 403
        else:
            cursor.execute("""
                SELECT id FROM chat_conversations 
                WHERE id = %s AND (seller_id = %s OR buyer_id = %s OR admin_id = %s)
            """, (chat_id, current_user['id'], current_user['id'], current_user['id']))
        
        if not cursor.fetchone():
            return jsonify({'error': 'Conversation not found or access denied'}), 404
        
        # Get messages
        cursor.execute("""
            SELECT 
                cm.*,
                u.name as sender_name
            FROM chat_messages cm
            JOIN users u ON cm.sender_id = u.id
            WHERE cm.conversation_id = %s
            ORDER BY cm.created_at ASC
        """, (chat_id,))
        
        messages = cursor.fetchall()
        
        return jsonify({
            'success': True,
            'messages': messages
        })
        
    except Exception as e:
        print(f"Error getting chat messages: {str(e)}")
        return jsonify({'error': 'Failed to get messages'}), 500
    finally:
        cursor.close()
        connection.close()

# Send chat message
@app.route('/api/chats/<int:chat_id>/messages', methods=['POST'])
@token_required
def send_chat_message(current_user, chat_id):
    """Send a message in a chat conversation"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Verify user has access to this conversation
        # Only buyers, sellers, and admins who are participants can send messages
        if current_user['role'] == 'rider':
            return jsonify({'error': 'Riders should use /api/rider/messages/{conversation_id}/send'}), 403
        else:
            cursor.execute("""
                SELECT seller_id, buyer_id, admin_id FROM chat_conversations 
                WHERE id = %s AND (seller_id = %s OR buyer_id = %s OR admin_id = %s)
            """, (chat_id, current_user['id'], current_user['id'], current_user['id']))
        
        conversation = cursor.fetchone()
        if not conversation:
            return jsonify({'error': 'Conversation not found or access denied'}), 404
        
        # Determine sender type based on user's actual role
        user_role = current_user.get('role', '').lower()
        if user_role == 'rider':
            sender_type = 'rider'
        elif user_role == 'seller':
            sender_type = 'seller'
        elif user_role == 'admin':
            sender_type = 'admin'
        elif user_role in ['buyer', 'user']:
            sender_type = 'buyer'
        else:
            return jsonify({'error': 'Invalid user role'}), 403
        
        data = request.get_json()
        content = data.get('content', '').strip()
        
        if not content:
            return jsonify({'error': 'Message content is required'}), 400
        
        # Insert message
        cursor.execute("""
            INSERT INTO chat_messages 
            (conversation_id, sender_id, sender_type, content)
            VALUES (%s, %s, %s, %s)
        """, (chat_id, current_user['id'], sender_type, content))
        
        message_id = cursor.lastrowid
        
        # Update conversation last_message_time
        cursor.execute("""
            UPDATE chat_conversations 
            SET last_message_time = NOW() 
            WHERE id = %s
        """, (chat_id,))
        
        # Create notification for the recipient
        recipient_id = None
        recipient_name = ""
        
        if sender_type == 'seller':
            # Seller is sending, notify the buyer
            recipient_id = conversation['buyer_id']
            recipient_name = "Buyer"
            notification_message = f"New message from seller: {content[:50]}{'...' if len(content) > 50 else ''}"
        elif sender_type == 'buyer':
            # Buyer is sending, notify the seller
            recipient_id = conversation['seller_id']
            recipient_name = "Seller"
            notification_message = f"New message from buyer: {content[:50]}{'...' if len(content) > 50 else ''}"
        elif sender_type == 'rider':
            # Rider is sending, notify both buyer and seller
            recipient_id = conversation['buyer_id']
            recipient_name = "Buyer"
            notification_message = f"New message from rider: {content[:50]}{'...' if len(content) > 50 else ''}"
            # Create notification for buyer
            cursor.execute("""
                INSERT INTO notifications (user_id, type, message, reference_id)
                VALUES (%s, 'chat_message', %s, %s)
            """, (recipient_id, notification_message, chat_id))
            
            # Also notify seller
            recipient_id = conversation['seller_id']
            recipient_name = "Seller"
            cursor.execute("""
                INSERT INTO notifications (user_id, type, message, reference_id)
                VALUES (%s, 'chat_message', %s, %s)
            """, (recipient_id, notification_message, chat_id))
        
        # Create single notification for non-rider messages
        if current_user['role'] != 'rider' and recipient_id:
            cursor.execute("""
                INSERT INTO notifications (user_id, type, message, reference_id)
                VALUES (%s, 'chat_message', %s, %s)
            """, (recipient_id, notification_message, chat_id))
        
        connection.commit()
        
        return jsonify({
            'success': True,
            'message_id': message_id,
            'message': 'Message sent successfully'
        })
        
    except Exception as e:
        connection.rollback()
        print(f"Error sending chat message: {str(e)}")
        return jsonify({'error': 'Failed to send message'}), 500
    finally:
        cursor.close()
        connection.close()

# Mark chat as read
# Support both PUT and POST to be compatible with various frontends
@app.route('/api/chats/<int:chat_id>/read', methods=['PUT', 'POST'])
@token_required
def mark_chat_as_read(current_user, chat_id):
    """Mark all messages in a chat as read by the current user.

    This endpoint is used by the global Chat Center and header message dropdown.
    It supports buyers, sellers, and riders (for conversations tied to their
    assigned deliveries).
    """
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor()
    
    try:
        # Verify user has access to this conversation
        role = current_user.get('role')
        if role == 'rider':
            # Riders can access chats for orders they are delivering
            cursor.execute("""
                SELECT cc.id
                FROM chat_conversations cc
                JOIN deliveries d ON d.order_id = cc.order_id
                WHERE cc.id = %s AND d.rider_id = %s
            """, (chat_id, current_user['id']))
        else:
            # Buyers, sellers (and most customer accounts) use direct ownership
            cursor.execute("""
                SELECT id FROM chat_conversations 
                WHERE id = %s AND (seller_id = %s OR buyer_id = %s)
            """, (chat_id, current_user['id'], current_user['id']))
        
        if not cursor.fetchone():
            return jsonify({'error': 'Conversation not found or access denied'}), 404
        
        # Mark messages as read (only messages not sent by current user)
        cursor.execute("""
            UPDATE chat_messages 
            SET is_read = TRUE 
            WHERE conversation_id = %s 
            AND sender_id != %s 
            AND is_read = FALSE
        """, (chat_id, current_user['id']))
        
        updated_count = cursor.rowcount
        connection.commit()
        
        return jsonify({
            'success': True,
            'updated_count': updated_count,
            'message': 'Messages marked as read'
        })
        
    except Exception as e:
        connection.rollback()
        print(f"Error marking chat as read: {str(e)}")
        return jsonify({'error': 'Failed to mark messages as read'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/seller/chats', methods=['GET', 'POST'])
@token_required
def seller_chats(current_user):
    if current_user.get('role') != 'seller':
        return jsonify({'error': 'Unauthorized'}), 403
    if request.method == 'GET':
        return get_chat_conversations(current_user)
    return create_chat_conversation(current_user)

@app.route('/api/chats', methods=['GET'])
@token_required
def list_chats(current_user):
    """Generic chat list endpoint that routes to appropriate handler based on user role"""
    role = current_user.get('role')
    if role == 'buyer':
        return buyer_list_chats_helper(current_user)
    elif role == 'seller':
        return get_chat_conversations(current_user)
    elif role == 'rider':
        # Riders should use their dedicated endpoint
        return jsonify({'error': 'Riders should use /api/rider/messages/conversations'}), 403
    elif role == 'admin':
        # Admins can see all chats
        return get_chat_conversations(current_user)
    else:
        return jsonify({'error': 'Unauthorized role for chat access'}), 403

@app.route('/api/seller/orders/<int:order_id>', methods=['GET'])
@token_required
def seller_get_order_details(current_user, order_id):
    """Get order details for seller - wrapper for get_order_details"""
    if current_user.get('role') != 'seller':
        return jsonify({'error': 'Unauthorized'}), 403
    
    # Call the order details logic directly by converting order_id to string
    # since get_order_details expects order_identifier as a string parameter from the route
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get order with buyer info
        cursor.execute("""
            SELECT 
                o.*,
                u.name as buyer_name,
                u.email as buyer_email,
                u.phone as buyer_phone
            FROM orders o
            LEFT JOIN users u ON o.buyer_id = u.id
            WHERE o.id = %s
        """, (order_id,))
        
        order = cursor.fetchone()
        if not order:
            return jsonify({'error': 'Order not found'}), 404

        # Check if seller has products in this order
        cursor.execute("""
            SELECT COUNT(*) as cnt
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = %s AND p.seller_id = %s
        """, (order['id'], current_user['id']))
        cnt = cursor.fetchone()['cnt']
        if cnt == 0:
            return jsonify({'error': 'Unauthorized'}), 403

        # Get order items with seller information
        cursor.execute("""
              SELECT 
                  oi.*,
                  p.name as product_name,
                  COALESCE((SELECT pvi.image_url FROM product_variant_images pvi WHERE pvi.product_id = p.id ORDER BY pvi.display_order ASC, pvi.id ASC LIMIT 1), p.image_url) AS image_url,
                  p.seller_id,
                  u.name as seller_name,
                  u.email as seller_email,
                  u.phone as seller_phone,
                  a.business_name,
                  a.business_registration,
                  u.phone as business_phone,
                  u.email as business_email
              FROM order_items oi
              JOIN products p ON oi.product_id = p.id
              LEFT JOIN users u ON p.seller_id = u.id
              LEFT JOIN applications a ON p.seller_id = a.user_id AND a.status = 'approved'
              WHERE oi.order_id = %s
          """, (order['id'],))

        items = cursor.fetchall()

        # Format the response
        detailed_order = {
            'id': order['id'],
            'order_number': order['order_number'],
            'status': order['status'],
            'payment_status': order.get('payment_status', 'pending'),
            'payment_method': order.get('payment_method'),
            'total_amount': float(order['total_amount']),
            'created_at': order['created_at'].isoformat() if order.get('created_at') else None,
            'tracking_number': order.get('tracking_number'),
            'special_notes': order.get('special_notes', ''),
            'buyer': {
                'name': order.get('buyer_name', 'N/A'),
                'full_name': order.get('full_name') or order.get('buyer_name', 'N/A'),
                'email': order.get('buyer_email', 'N/A'),
                'phone': order.get('buyer_phone', 'N/A')
            },
            'customer_name': order.get('full_name') or order.get('buyer_name'),
            'shipping': {
                'address': order.get('address', ''),
                'city': order.get('city', ''),
                'postal_code': order.get('postal_code', ''),
                'country': order.get('country', 'Philippines'),
                'full_address': f"{order.get('address', '')}, {order.get('city', '')} {order.get('postal_code', '')}, {order.get('country', 'Philippines')}"
            },
            'items': [{
                'id': item['id'],
                'product_id': item['product_id'],
                'name': item['product_name'],
                'product_name': item['product_name'],
                'quantity': item['quantity'],
                'price': float(item['price']),
                'subtotal': float(item['price'] * item['quantity']),
                'image_url': item.get('image_url', ''),
                'size': item.get('size', ''),
                'color': item.get('color', ''),
                'seller_name': item.get('seller_name', 'Unknown Seller'),
                'seller_info': {
                    'business_name': item.get('business_name') or item.get('seller_name', 'N/A'),
                    'business_registration': item.get('business_registration', 'N/A'),
                    'phone': item.get('business_phone') or item.get('seller_phone', 'N/A'),
                    'email': item.get('business_email') or item.get('seller_email', 'N/A')
                }
            } for item in items]
        }

        return jsonify({
            'success': True,
            'order': detailed_order
        })

    except Exception as e:
        print(f"Error fetching seller order details: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to fetch order details'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/seller/orders', methods=['GET'])
@token_required
def seller_orders(current_user):
    if current_user.get('role') != 'seller':
        return jsonify({'error': 'Unauthorized'}), 403
    try:
        order_id = request.args.get('order_id', type=int)
    except Exception:
        order_id = None
    if order_id:
        return get_order_details(current_user, order_id)
    return get_orders(current_user)

@app.route('/api/seller/sales-report', methods=['GET'])
@token_required
def seller_sales_report(current_user):
    """Return tabular sales data for the seller, with optional date filters.
    Query params: from=YYYY-MM-DD, to=YYYY-MM-DD
    """
    if current_user.get('role') != 'seller':
        return jsonify({'error': 'Unauthorized'}), 403

    date_from = request.args.get('from')
    date_to = request.args.get('to')

    # Default range: last 30 days
    try:
        now = datetime.now()
        if not date_to:
            date_to = now.strftime('%Y-%m-%d')
        if not date_from:
            date_from = (now - timedelta(days=29)).strftime('%Y-%m-%d')
    except Exception:
        pass

    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = connection.cursor(dictionary=True)
    try:
        params = [current_user['id']]
        where = ["p.seller_id = %s"]
        if date_from:
            where.append("DATE(o.created_at) >= %s"); params.append(date_from)
        if date_to:
            where.append("DATE(o.created_at) <= %s"); params.append(date_to)
        where_sql = ' AND '.join(where)

        # Only include confirmed and later statuses (not pending)
        where.append("o.status != 'pending'")
        where.append("o.status IN ('confirmed', 'prepared', 'shipped', 'delivered')")
        where_sql = ' AND '.join(where)

        cursor.execute(f"""
            SELECT 
                o.order_number,
                o.created_at,
                o.status,
                o.payment_status,
                u.name as buyer_name,
                u.email as buyer_email,
                oi.product_id,
                p.name as product_name,
                oi.size,
                oi.color,
                oi.quantity,
                oi.price,
                (oi.quantity * oi.price) as subtotal
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN products p ON oi.product_id = p.id
            LEFT JOIN users u ON o.buyer_id = u.id
            WHERE {where_sql}
            ORDER BY o.created_at DESC
        """, params)
        rows = cursor.fetchall() or []

        # Aggregates with commission calculation (5% admin commission)
        ADMIN_COMMISSION_RATE = 0.05
        total_sales = 0.0
        total_commission = 0.0
        total_earnings = 0.0
        total_items = 0
        order_set = set()
        product_sales = {}  # product_name -> {quantity, sales, commission, earnings}
        
        for r in rows:
            subtotal = float(r.get('subtotal') or 0)
            commission = subtotal * ADMIN_COMMISSION_RATE
            earnings = subtotal - commission
            
            total_sales += subtotal
            total_commission += commission
            total_earnings += earnings
            total_items += int(r.get('quantity') or 0)
            
            # Approx order count by order_number
            if r.get('order_number'):
                order_set.add(r['order_number'])
            
            # Aggregate by product
            product_name = r.get('product_name') or 'Unknown'
            if product_name not in product_sales:
                product_sales[product_name] = {
                    'quantity': 0,
                    'sales': 0.0,
                    'commission': 0.0,
                    'earnings': 0.0
                }
            product_sales[product_name]['quantity'] += int(r.get('quantity') or 0)
            product_sales[product_name]['sales'] += subtotal
            product_sales[product_name]['commission'] += commission
            product_sales[product_name]['earnings'] += earnings

        # Convert product_sales to list
        product_report = [
            {
                'product': name,
                'quantity': data['quantity'],
                'sales': round(data['sales'], 2),
                'commission': round(data['commission'], 2),
                'earnings': round(data['earnings'], 2)
            }
            for name, data in sorted(product_sales.items(), key=lambda x: x[1]['sales'], reverse=True)
        ]

        return jsonify({
            'success': True,
            'from': date_from,
            'to': date_to,
            'summary': {
                'total_sales': round(total_sales, 2),
                'total_commission': round(total_commission, 2),
                'total_earnings': round(total_earnings, 2),
                'commission_rate': ADMIN_COMMISSION_RATE * 100,
                'total_items': total_items,
                'total_orders': len(order_set)
            },
            'products': product_report,
            'rows': [
                {
                    'order_number': r['order_number'],
                    'date': r['created_at'].isoformat() if r.get('created_at') else None,
                    'status': r.get('status'),
                    'payment_status': r.get('payment_status'),
                    'buyer': r.get('buyer_name') or r.get('buyer_email') or 'N/A',
                    'product': r.get('product_name'),
                    'size': r.get('size'),
                    'color': r.get('color'),
                    'quantity': int(r.get('quantity') or 0),
                    'price': float(r.get('price') or 0),
                    'subtotal': float(r.get('subtotal') or 0),
                    'commission': round(float(r.get('subtotal') or 0) * ADMIN_COMMISSION_RATE, 2),
                    'earnings': round(float(r.get('subtotal') or 0) * (1 - ADMIN_COMMISSION_RATE), 2)
                } for r in rows
            ]
        })
    except Exception as e:
        print(f"[SELLER-REPORT] Error: {e}")
        return jsonify({'error': 'Failed to build sales report'}), 500
    finally:
        cursor.close(); connection.close()

@app.route('/admin')
def admin_root():
    return redirect('/admin/dashboard')

@app.route('/admin/dashboard')
def admin_dashboard():
    if 'user_role' not in session or session['user_role'] != 'admin':
        return redirect('/')  # prevent non-admins from opening it
    
    return render_template('AdminDashboard/admin.html')

@app.route('/admin/pending-users')
def admin_pending_users():
    if 'user_role' not in session or session['user_role'] != 'admin':
        return redirect('/')  # prevent non-admins from opening it
    
    return render_template('AdminDashboard/pending-users.html')

@app.route('/admin/seller-applications')
def admin_seller_applications():
    if 'user_role' not in session or session['user_role'] != 'admin':
        return redirect('/')  # prevent non-admins from opening it
    
    return render_template('AdminDashboard/seller-applications.html')

@app.route('/admin/rider-applications')
def admin_rider_applications():
    if 'user_role' not in session or session['user_role'] != 'admin':
        return redirect('/')  # prevent non-admins from opening it
    
    return render_template('AdminDashboard/rider-applications.html')

@app.route('/admin/order-management')
def admin_order_management():
    if 'user_role' not in session or session['user_role'] != 'admin':
        return redirect('/')  # prevent non-admins from opening it
    
    return render_template('AdminDashboard/order-management.html')

@app.route('/admin/delivery-management')
def admin_delivery_management():
    if 'user_role' not in session or session['user_role'] != 'admin':
        return redirect('/')  # prevent non-admins from opening it
    
    return render_template('AdminDashboard/delivery-management.html')

@app.route('/admin/reports')
def admin_reports():
    if 'user_role' not in session or session['user_role'] != 'admin':
        return redirect('/')  # prevent non-admins from opening it
    
    return render_template('AdminDashboard/reports.html')

@app.route('/admin/settings')
def admin_settings():
    if 'user_role' not in session or session['user_role'] != 'admin':
        return redirect('/')  # prevent non-admins from opening it
    return render_template('AdminDashboard/settings.html')

@app.route('/admin/flash-sales')
def admin_flash_sales():
    if 'user_role' not in session or session['user_role'] != 'admin':
        return redirect('/')
    return render_template('AdminDashboard/flash-sales.html')

@app.route('/admin/products')
def admin_products_page():
    if 'user_role' not in session or session['user_role'] != 'admin':
        return redirect('/')
    return render_template('AdminDashboard/products.html')

@app.route('/admin/seller-products')
@token_required
@admin_required
def admin_seller_products_page(current_user):
    return render_template('AdminDashboard/seller-products.html')

@app.route('/admin/product-management')
@token_required
@admin_required
def admin_product_management_page(current_user):
    return render_template('AdminDashboard/product-management.html')

@app.route('/admin/rider-management')
@token_required
@admin_required
def admin_rider_management_page(current_user):
    return render_template('AdminDashboard/rider-management.html')


@app.route('/api/debug/product/<int:product_id>/stock-details', methods=['GET'])
def debug_product_stock(product_id):
    """Debug endpoint to check detailed product stock information"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500

    try:
        cursor = connection.cursor(dictionary=True)
        
        # Get all stock variants for this product
        cursor.execute("""
            SELECT 
                product_id,
                size,
                color,
                color_name,
                stock_quantity,
                price,
                discount_price
            FROM product_size_stock 
            WHERE product_id = %s
            ORDER BY size, color
        """, (product_id,))
        
        variants = cursor.fetchall()
        
        cursor.execute("""
            SELECT id, name, total_stock
            FROM products 
            WHERE id = %s
        """, (product_id,))
        
        product = cursor.fetchone()
        
        return jsonify({
            'product_id': product_id,
            'product_info': product,
            'variants': variants,
            'total_variants': len(variants)
        })
        
    except Exception as e:
        print(f"Error checking product stock: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()

@app.route('/api/products/<int:product_id>/reviews', methods=['GET', 'POST'])
def manage_product_reviews(product_id):
    """Get or add reviews for a product"""
    if request.method == 'GET':
        try:
            connection = get_db_connection()
            cursor = connection.cursor(dictionary=True)
            cursor.execute("""
                SELECT 
                    pr.id, pr.rating, pr.comment, pr.created_at,
                    u.name as user_name, u.id as user_id
                FROM product_reviews pr
                JOIN users u ON pr.user_id = u.id
                WHERE pr.product_id = %s
                ORDER BY pr.created_at DESC
            """, (product_id,))
            reviews = cursor.fetchall()
            
            # Attach media for these reviews
            media_map = {}
            if reviews:
                review_ids = [r['id'] for r in reviews]
                in_clause = ','.join(['%s'] * len(review_ids))
                cursor.execute(f"SELECT review_id, media_type, url FROM product_review_media WHERE review_id IN ({in_clause})", tuple(review_ids))
                for row in cursor.fetchall() or []:
                    media_map.setdefault(row['review_id'], []).append({ 'type': row['media_type'], 'url': row['url'] })
            
            if reviews:
                avg_rating = sum(r['rating'] for r in reviews) / len(reviews)
            else:
                avg_rating = 0
                
            formatted_reviews = [{
                'id': r['id'],
                'rating': r['rating'],
                'comment': r['comment'],
                'user_name': r['user_name'],
                'user_id': r['user_id'],
                'created_at': r['created_at'].isoformat() if r['created_at'] else None,
                'media': media_map.get(r['id'], [])
            } for r in reviews]
            
            return jsonify({
                'success': True,
                'reviews': formatted_reviews,
                'average_rating': round(avg_rating, 1),
                'total_reviews': len(reviews)
            })
        except Exception as e:
            return jsonify({'error': 'Failed to fetch reviews'}), 500
        finally:
            if 'cursor' in locals():
                cursor.close()
            if 'connection' in locals():
                connection.close()
    
    current_user = None
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if token:
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            connection = get_db_connection()
            cursor = connection.cursor(dictionary=True)
            cursor.execute('SELECT * FROM users WHERE id = %s', (data['user_id'],))
            current_user = cursor.fetchone()
            cursor.close()
            connection.close()
        except:
            pass
    
    if not current_user:
        return jsonify({'error': 'Authentication required'}), 401
    
    try:
        # Accept JSON or multipart with media
        if request.content_type and 'multipart/form-data' in request.content_type.lower():
            form = request.form
            try:
                rating = int(form.get('rating') or 0)
            except Exception:
                rating = 0
            comment = form.get('comment', '')
            try:
                order_id = int(form.get('order_id') or 0)
            except Exception:
                order_id = 0
            incoming_files = []
            # Prefer 'media[]' but also accept 'media'
            if 'media[]' in request.files:
                incoming_files = request.files.getlist('media[]')
            elif 'media' in request.files:
                f = request.files.get('media')
                incoming_files = [f] if f and f.filename else []
        else:
            data = request.get_json() or {}
            rating = int(data.get('rating') or 0)
            comment = data.get('comment', '')
            order_id = data.get('order_id')
            incoming_files = []
        
        if not rating or not order_id:
            return jsonify({'error': 'Rating and order ID are required'}), 400
        if not (1 <= rating <= 5):
            return jsonify({'error': 'Rating must be between 1 and 5'}), 400
            
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        
        cursor.execute("SELECT seller_id FROM products WHERE id = %s", (product_id,))
        product = cursor.fetchone()
        if not product:
            return jsonify({'error': 'Product not found'}), 404
        if product['seller_id'] == current_user['id']:
            return jsonify({'error': 'You cannot review your own product'}), 403
            
        cursor.execute("""
            SELECT o.id, o.status, oi.id as order_item_id
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE o.id = %s AND o.buyer_id = %s AND oi.product_id = %s
        """, (order_id, current_user['id'], product_id))
        
        order = cursor.fetchone()
        if not order:
            return jsonify({'error': 'Order not found or does not contain this product'}), 404
        if order['status'] != 'delivered':
            return jsonify({'error': 'You can only review products from delivered orders'}), 403
            
        cursor.execute("""
            SELECT id FROM product_reviews 
            WHERE user_id = %s AND product_id = %s AND order_id = %s
        """, (current_user['id'], product_id, order_id))
        
        if cursor.fetchone():
            return jsonify({'error': 'You have already reviewed this product from this order'}), 400
            
        # Insert review
        cursor.execute("""
            INSERT INTO product_reviews (user_id, product_id, order_id, rating, comment, created_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
        """, (current_user['id'], product_id, order_id, rating, comment))
        review_id = cursor.lastrowid
        
        # Save media if provided
        saved_count = 0
        try:
            if incoming_files:
                import time
                from werkzeug.utils import secure_filename
                allowed_img = {'png','jpg','jpeg','gif'}
                allowed_vid = {'mp4','webm','mov','m4v'}
                base_dir = os.path.join(app.static_folder, 'uploads', 'reviews', str(current_user['id']))
                os.makedirs(base_dir, exist_ok=True)
                for f in incoming_files[:10]:
                    if not f or not getattr(f, 'filename', ''):
                        continue
                    ext = (f.filename.rsplit('.',1)[-1] or '').lower()
                    media_type = 'image' if ext in allowed_img else 'video' if ext in allowed_vid else None
                    if not media_type:
                        continue
                    ts = time.strftime('%Y%m%d_%H%M%S')
                    filename = secure_filename(f"rev_{review_id}_{ts}_{f.filename}")
                    path = os.path.join(base_dir, filename)
                    f.save(path)
                    url = f"/static/uploads/reviews/{current_user['id']}/{filename}"
                    cursor.execute("INSERT INTO product_review_media (review_id, media_type, url) VALUES (%s,%s,%s)", (review_id, media_type, url))
                    saved_count += 1
        except Exception as _:
            pass
        
        connection.commit()
        
        return jsonify({'success': True, 'message': 'Review added successfully', 'media_saved': saved_count})
    except Exception as e:
        return jsonify({'error': 'Failed to add review'}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'connection' in locals():
            connection.close()

@app.route('/api/orders/<int:order_id>/review-eligibility', methods=['GET'])
@token_required
def check_review_eligibility(current_user, order_id):
    """Check which products from an order can be reviewed"""
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        
        # Get order and its items
        cursor.execute("""
            SELECT o.id, o.status, o.buyer_id
            FROM orders o
            WHERE o.id = %s AND o.buyer_id = %s
        """, (order_id, current_user['id']))
        
        order = cursor.fetchone()
        if not order:
            return jsonify({'error': 'Order not found'}), 404
            
        if order['status'] != 'delivered':
            return jsonify({
                'eligible': False,
                'reason': 'Order must be delivered before you can review products'
            })
            
        # Get products from order and check review status
        cursor.execute("""
            SELECT 
                oi.product_id,
                p.name as product_name,
                EXISTS(
                    SELECT 1 FROM product_reviews pr 
                    WHERE pr.product_id = oi.product_id 
                    AND pr.user_id = %s 
                    AND pr.order_id = %s
                ) as already_reviewed
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = %s
        """, (current_user['id'], order_id, order_id))
        
        products = cursor.fetchall()
        
        reviewable_products = [{
            'product_id': p['product_id'],
            'product_name': p['product_name'],
            'already_reviewed': bool(p['already_reviewed'])
        } for p in products]
        
        return jsonify({
            'eligible': True,
            'products': reviewable_products
        })
        
    except Exception as e:
        print(f"Error checking review eligibility: {str(e)}")
        return jsonify({'error': 'Failed to check eligibility'}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'connection' in locals():
            connection.close()

# ===== REVIEW ENHANCEMENTS: edit/delete/paginated & seller summary =====

@app.route('/api/products/<int:product_id>/reviews/paginated', methods=['GET'])
def list_product_reviews_paginated(product_id):
    """Paginated reviews with sorting plus aggregated stats."""
    try:
        page = max(int(request.args.get('page', 1) or 1), 1)
        per_page = int(request.args.get('per_page', 10) or 10)
        per_page = 1 if per_page < 1 else 100 if per_page > 100 else per_page
        sort = (request.args.get('sort') or 'newest').lower()
        sort_sql = 'pr.created_at DESC'
        if sort == 'oldest':
            sort_sql = 'pr.created_at ASC'
        elif sort == 'highest':
            sort_sql = 'pr.rating DESC, pr.created_at DESC'
        elif sort == 'lowest':
            sort_sql = 'pr.rating ASC, pr.created_at DESC'

        offset = (page - 1) * per_page

        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        cursor = connection.cursor(dictionary=True)

        # Aggregate
        cursor.execute(
            "SELECT COUNT(*) AS total, COALESCE(AVG(rating),0) AS avg_rating FROM product_reviews WHERE product_id = %s",
            (product_id,)
        )
        agg = cursor.fetchone() or {'total': 0, 'avg_rating': 0}

        # Optional filters
        media_only = (request.args.get('media_only') in ('1','true','True'))
        rating_filter = request.args.get('rating')
        where = ["pr.product_id = %s"]
        params = [product_id]
        if rating_filter and rating_filter.isdigit():
            where.append("pr.rating = %s"); params.append(int(rating_filter))
        if media_only:
            where.append("EXISTS (SELECT 1 FROM product_review_media m WHERE m.review_id = pr.id)")
        where_sql = ' AND '.join(where)

        # Page data
        cursor.execute(f"""
            SELECT pr.id, pr.rating, pr.comment, pr.created_at, u.name AS user_name, u.id AS user_id
            FROM product_reviews pr
            JOIN users u ON pr.user_id = u.id
            WHERE {where_sql}
            ORDER BY {sort_sql}
            LIMIT %s OFFSET %s
        """, (*params, per_page, offset))
        rows = cursor.fetchall() or []

        # Media for this page
        media_map = {}
        if rows:
            ids = [r['id'] for r in rows]
            in_clause = ','.join(['%s'] * len(ids))
            cursor.execute(f"SELECT review_id, media_type, url FROM product_review_media WHERE review_id IN ({in_clause})", tuple(ids))
            for row in cursor.fetchall() or []:
                media_map.setdefault(row['review_id'], []).append({'type': row['media_type'], 'url': row['url']})

        reviews = [{
            'id': r['id'],
            'rating': r['rating'],
            'comment': r['comment'],
            'user_name': r['user_name'],
            'created_at': r['created_at'].isoformat() if r.get('created_at') else None,
            'media': media_map.get(r['id'], [])
        } for r in rows]

        total_pages = (agg['total'] + per_page - 1) // per_page if per_page else 1

        return jsonify({
            'success': True,
            'reviews': reviews,
            'page': page,
            'per_page': per_page,
            'total': agg['total'],
            'total_pages': int(total_pages),
            'average_rating': round(float(agg['avg_rating'] or 0), 1)
        })
    except Exception as e:
        print(f"[REVIEWS] Pagination error: {e}")
        return jsonify({'error': 'Failed to fetch reviews'}), 500
    finally:
        try:
            cursor.close(); connection.close()
        except Exception:
            pass


@app.route('/api/products/<int:product_id>/reviews/<int:review_id>', methods=['PUT'])
@token_required
def update_product_review(current_user, product_id, review_id):
    """Edit own review; admins may edit any review."""
    try:
        data = request.get_json(silent=True) or {}
        new_rating = data.get('rating')
        new_comment = data.get('comment')

        if new_rating is None and new_comment is None:
            return jsonify({'error': 'Nothing to update'}), 400
        if new_rating is not None and not (1 <= int(new_rating) <= 5):
            return jsonify({'error': 'Rating must be between 1 and 5'}), 400

        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        cursor = connection.cursor(dictionary=True)

        cursor.execute("SELECT id, user_id FROM product_reviews WHERE id = %s AND product_id = %s", (review_id, product_id))
        review = cursor.fetchone()
        if not review:
            return jsonify({'error': 'Review not found'}), 404

        is_admin = (current_user.get('role') == 'admin')
        if not is_admin and review['user_id'] != current_user['id']:
            return jsonify({'error': 'You can only edit your own review'}), 403

        # Ensure updated_at exists (idempotent)
        try:
            cursor.execute("SHOW COLUMNS FROM product_reviews LIKE 'updated_at'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE product_reviews ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")
        except Exception:
            pass

        sets = []
        params = []
        if new_rating is not None:
            sets.append('rating = %s'); params.append(int(new_rating))
        if new_comment is not None:
            sets.append('comment = %s'); params.append(new_comment)
        sets_sql = ', '.join(sets)
        params.extend([review_id])

        cursor.execute(f"UPDATE product_reviews SET {sets_sql} WHERE id = %s", tuple(params))
        connection.commit()
        return jsonify({'success': True, 'message': 'Review updated'})
    except Exception as e:
        print(f"[REVIEWS] Update error: {e}")
        return jsonify({'error': 'Failed to update review'}), 500
    finally:
        try:
            cursor.close(); connection.close()
        except Exception:
            pass


@app.route('/api/products/<int:product_id>/reviews/<int:review_id>', methods=['DELETE'])
@token_required
def delete_product_review(current_user, product_id, review_id):
    """Delete own review; admins may delete any review."""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        cursor = connection.cursor(dictionary=True)

        cursor.execute("SELECT id, user_id FROM product_reviews WHERE id = %s AND product_id = %s", (review_id, product_id))
        review = cursor.fetchone()
        if not review:
            return jsonify({'error': 'Review not found'}), 404

        is_admin = (current_user.get('role') == 'admin')
        if not is_admin and review['user_id'] != current_user['id']:
            return jsonify({'error': 'You can only delete your own review'}), 403

        cursor.execute("DELETE FROM product_reviews WHERE id = %s", (review_id,))
        connection.commit()
        return jsonify({'success': True, 'message': 'Review deleted'})
    except Exception as e:
        print(f"[REVIEWS] Delete error: {e}")
        return jsonify({'error': 'Failed to delete review'}), 500
    finally:
        try:
            cursor.close(); connection.close()
        except Exception:
            pass


@app.route('/api/products/<int:product_id>/ratings-summary', methods=['GET'])
def product_ratings_summary(product_id):
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT 
                COUNT(pr.id) AS total_reviews,
                COALESCE(AVG(pr.rating), 0) AS avg_rating,
                SUM(CASE WHEN pr.rating = 5 THEN 1 ELSE 0 END) AS r5,
                SUM(CASE WHEN pr.rating = 4 THEN 1 ELSE 0 END) AS r4,
                SUM(CASE WHEN pr.rating = 3 THEN 1 ELSE 0 END) AS r3,
                SUM(CASE WHEN pr.rating = 2 THEN 1 ELSE 0 END) AS r2,
                SUM(CASE WHEN pr.rating = 1 THEN 1 ELSE 0 END) AS r1
            FROM product_reviews pr
            WHERE pr.product_id = %s
            """,
            (product_id,)
        )
        row = cursor.fetchone() or {}
        return jsonify({
            'success': True,
            'product_id': product_id,
            'average_rating': round(float(row.get('avg_rating') or 0), 1),
            'total_reviews': int(row.get('total_reviews') or 0),
            'distribution': {
                '5': int(row.get('r5') or 0),
                '4': int(row.get('r4') or 0),
                '3': int(row.get('r3') or 0),
                '2': int(row.get('r2') or 0),
                '1': int(row.get('r1') or 0)
            }
        })
    except Exception as e:
        print(f"[REVIEWS] Product summary error: {e}")
        return jsonify({'error': 'Failed to compute product rating summary'}), 500
    finally:
        try:
            cursor.close(); connection.close()
        except Exception:
            pass

@app.route('/api/sellers/<int:seller_id>/ratings-summary', methods=['GET'])
def seller_ratings_summary(seller_id):
    """Aggregate rating stats for a seller across their products."""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT 
                COUNT(pr.id) AS total_reviews,
                COALESCE(AVG(pr.rating), 0) AS avg_rating,
                SUM(CASE WHEN pr.rating = 5 THEN 1 ELSE 0 END) AS r5,
                SUM(CASE WHEN pr.rating = 4 THEN 1 ELSE 0 END) AS r4,
                SUM(CASE WHEN pr.rating = 3 THEN 1 ELSE 0 END) AS r3,
                SUM(CASE WHEN pr.rating = 2 THEN 1 ELSE 0 END) AS r2,
                SUM(CASE WHEN pr.rating = 1 THEN 1 ELSE 0 END) AS r1
            FROM product_reviews pr
            JOIN products p ON pr.product_id = p.id
            WHERE p.seller_id = %s
            """,
            (seller_id,)
        )
        row = cursor.fetchone() or {}
        return jsonify({
            'success': True,
            'seller_id': seller_id,
            'average_rating': round(float(row.get('avg_rating') or 0), 1),
            'total_reviews': int(row.get('total_reviews') or 0),
            'distribution': {
                '5': int(row.get('r5') or 0),
                '4': int(row.get('r4') or 0),
                '3': int(row.get('r3') or 0),
                '2': int(row.get('r2') or 0),
                '1': int(row.get('r1') or 0)
            }
        })
    except Exception as e:
        print(f"[REVIEWS] Seller summary error: {e}")
        return jsonify({'error': 'Failed to compute seller rating summary'}), 500
    finally:
        try:
            cursor.close(); connection.close()
        except Exception:
            pass

# ===== REFUND MANAGEMENT ENDPOINTS =====

@app.route('/api/orders/<int:order_id>/refund', methods=['POST'])
@token_required
def request_refund(current_user, order_id):
    """Create a refund request for an order"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get order details
        cursor.execute("""
            SELECT o.*, o.buyer_id, o.payment_provider_id, o.payment_provider
            FROM orders o
            WHERE o.id = %s
        """, (order_id,))
        
        order = cursor.fetchone()
        if not order:
            return jsonify({'error': 'Order not found'}), 404
        
        # Verify user owns the order
        if order['buyer_id'] != current_user['id']:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Check if order is eligible for refund
        if order['payment_status'] != 'paid':
            return jsonify({'error': 'Order must be paid to request refund'}), 400
        
        if order['status'] in ['delivered', 'cancelled']:
            return jsonify({'error': f'Cannot refund {order["status"]} orders'}), 400
        
        # Check if refund already exists
        cursor.execute("""
            SELECT id, status FROM refund_requests
            WHERE order_id = %s AND status NOT IN ('rejected', 'failed')
        """, (order_id,))
        
        existing_refund = cursor.fetchone()
        if existing_refund:
            return jsonify({'error': 'Refund request already exists for this order'}), 400
        
        # Get request data
        data = request.get_json()
        reason = data.get('reason', '').strip()
        
        if not reason:
            return jsonify({'error': 'Refund reason is required'}), 400
        
        # Create refund request
        cursor.execute("""
            INSERT INTO refund_requests 
            (order_id, user_id, amount, reason, payment_provider_id, payment_provider)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            order_id,
            current_user['id'],
            order['total_amount'],
            reason,
            order.get('payment_provider_id'),
            order.get('payment_provider', 'xendit')
        ))
        
        refund_id = cursor.lastrowid
        connection.commit()
        
        # Create notification for buyer
        create_notification(
            current_user['id'],
            'refund_requested',
            f'Your refund request for order #{order["order_number"]} has been submitted.',
            order_id
        )
        
        return jsonify({
            'success': True,
            'refund_id': refund_id,
            'message': 'Refund request submitted successfully'
        })
        
    except Exception as e:
        connection.rollback()
        print(f"[REFUND] Error creating refund request: {str(e)}")
        return jsonify({'error': 'Failed to create refund request'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/refunds/<int:refund_id>/process', methods=['POST'])
@token_required
@admin_required
def process_refund(current_user, refund_id):
    """Process a refund request (admin only)"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Get refund request
        cursor.execute("""
            SELECT rr.*, o.order_number
            FROM refund_requests rr
            JOIN orders o ON rr.order_id = o.id
            WHERE rr.id = %s
        """, (refund_id,))
        
        refund = cursor.fetchone()
        if not refund:
            return jsonify({'error': 'Refund request not found'}), 404
        
        if refund['status'] != 'pending':
            return jsonify({'error': f'Cannot process refund with status: {refund["status"]}'}), 400
        
        # Get action and notes from request
        data = request.get_json()
        action = data.get('action')  # 'approve' or 'reject'
        admin_notes = data.get('notes', '')
        
        if action not in ['approve', 'reject']:
            return jsonify({'error': 'Invalid action. Must be approve or reject'}), 400
        
        if action == 'reject':
            # Simply reject without processing payment
            cursor.execute("""
                UPDATE refund_requests
                SET status = 'rejected',
                    admin_notes = %s,
                    processed_by = %s,
                    processed_at = NOW()
                WHERE id = %s
            """, (admin_notes, current_user['id'], refund_id))
            
            connection.commit()
            
            # Notify user
            create_notification(
                refund['user_id'],
                'refund_rejected',
                f'Your refund request for order #{refund["order_number"]} has been rejected.',
                refund['order_id']
            )
            
            return jsonify({
                'success': True,
                'message': 'Refund request rejected'
            })
        
        # Approve and process refund
        try:
            # Update status to processing
            cursor.execute("""
                UPDATE refund_requests
                SET status = 'processing',
                    admin_notes = %s,
                    processed_by = %s,
                    processed_at = NOW()
                WHERE id = %s
            """, (admin_notes, current_user['id'], refund_id))
            connection.commit()
            
            # Process refund via payment provider
            if refund.get('payment_provider_id'):
                try:
                    refund_result = xendit.create_refund(
                        refund['payment_provider_id'],
                        float(refund['amount']),
                        reason=f"Refund for order {refund['order_number']}",
                        reference_id=f"refund_{refund_id}"
                    )
                    
                    # Update refund with provider ID
                    cursor.execute("""
                        UPDATE refund_requests
                        SET status = 'completed',
                            refund_provider_id = %s
                        WHERE id = %s
                    """, (refund_result.get('refund_id'), refund_id))
                    
                    # Update order payment status
                    cursor.execute("""
                        UPDATE orders
                        SET payment_status = 'refunded'
                        WHERE id = %s
                    """, (refund['order_id'],))
                    
                    connection.commit()
                    
                    # Notify user
                    create_notification(
                        refund['user_id'],
                        'refund_completed',
                        f'Your refund for order #{refund["order_number"]} has been processed.',
                        refund['order_id']
                    )
                    
                    return jsonify({
                        'success': True,
                        'message': 'Refund processed successfully',
                        'refund_provider_id': refund_result.get('refund_id')
                    })
                    
                except Exception as e:
                    # Mark as failed
                    cursor.execute("""
                        UPDATE refund_requests
                        SET status = 'failed',
                            admin_notes = CONCAT(COALESCE(admin_notes, ''), '\n', %s)
                        WHERE id = %s
                    """, (f"Payment provider error: {str(e)}", refund_id))
                    connection.commit()
                    
                    return jsonify({'error': f'Failed to process refund: {str(e)}'}), 500
            else:
                return jsonify({'error': 'No payment provider ID found for this order'}), 400
                
        except Exception as e:
            connection.rollback()
            raise e
            
    except Exception as e:
        connection.rollback()
        print(f"[REFUND] Error processing refund: {str(e)}")
        return jsonify({'error': 'Failed to process refund'}), 500
    finally:
        cursor.close()
        connection.close()

@app.route('/api/refunds', methods=['GET'])
@token_required
def get_refunds(current_user):
    """Get refund requests (admin sees all, users see their own)"""
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        if current_user['role'] == 'admin':
            cursor.execute("""
                SELECT rr.*, o.order_number, u.name as user_name, u.email as user_email,
                       a.name as processed_by_name
                FROM refund_requests rr
                JOIN orders o ON rr.order_id = o.id
                JOIN users u ON rr.user_id = u.id
                LEFT JOIN users a ON rr.processed_by = a.id
                ORDER BY rr.created_at DESC
            """)
        else:
            cursor.execute("""
                SELECT rr.*, o.order_number
                FROM refund_requests rr
                JOIN orders o ON rr.order_id = o.id
                WHERE rr.user_id = %s
                ORDER BY rr.created_at DESC
            """, (current_user['id'],))
        
        refunds = cursor.fetchall()
        
        # Format refunds
        formatted_refunds = []
        for refund in refunds:
            formatted_refunds.append({
                'id': refund['id'],
                'order_id': refund['order_id'],
                'order_number': refund['order_number'],
                'amount': float(refund['amount']),
                'reason': refund['reason'],
                'status': refund['status'],
                'admin_notes': refund.get('admin_notes'),
                'created_at': refund['created_at'].isoformat() if refund.get('created_at') else None,
                'processed_at': refund['processed_at'].isoformat() if refund.get('processed_at') else None,
                **({
                    'user_name': refund.get('user_name'),
                    'user_email': refund.get('user_email'),
                    'processed_by_name': refund.get('processed_by_name')
                } if current_user['role'] == 'admin' else {})
            })
        
        return jsonify({
            'success': True,
            'refunds': formatted_refunds
        })
        
    except Exception as e:
        print(f"[REFUND] Error fetching refunds: {str(e)}")
        return jsonify({'error': 'Failed to fetch refunds'}), 500
    finally:
        cursor.close()
        connection.close()

# Admin Reports API
@app.route('/api/admin/reports', methods=['GET'])
@token_required
@admin_required
def get_admin_reports(current_user):
    """Get comprehensive admin reports with date range filtering"""
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = connection.cursor(dictionary=True)
    
    try:
        # Build date filter
        date_filter = ""
        params = []
        if date_from and date_to:
            date_filter = "AND DATE(o.created_at) BETWEEN %s AND %s"
            params = [date_from, date_to]
        elif date_from:
            date_filter = "AND DATE(o.created_at) >= %s"
            params = [date_from]
        elif date_to:
            date_filter = "AND DATE(o.created_at) <= %s"
            params = [date_to]
        
        # === SALES REPORT ===
        # Total sales
        cursor.execute(f"""
            SELECT 
                COALESCE(SUM(o.total_amount), 0) as total_sales,
                COUNT(DISTINCT o.id) as total_orders,
                COALESCE(SUM(oi.quantity), 0) as total_items_sold
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE o.status != 'cancelled' {date_filter}
        """, params)
        sales_data = cursor.fetchone()
        
        # Sales by month (last 12 months)
        if date_from or date_to:
            monthly_sales_filter = date_filter
            monthly_sales_params = params
        else:
            monthly_sales_filter = "AND DATE(o.created_at) >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)"
            monthly_sales_params = []
        
        cursor.execute(f"""
            SELECT 
                DATE_FORMAT(o.created_at, '%Y-%m') as month,
                COALESCE(SUM(o.total_amount), 0) as sales,
                COUNT(DISTINCT o.id) as orders
            FROM orders o
            WHERE o.status != 'cancelled' {monthly_sales_filter}
            GROUP BY DATE_FORMAT(o.created_at, '%Y-%m')
            ORDER BY month DESC
            LIMIT 12
        """, monthly_sales_params)
        monthly_sales = cursor.fetchall()
        
        # === USER ANALYTICS ===
        # Total users
        cursor.execute("SELECT COUNT(*) as total FROM users WHERE role != 'admin'")
        total_users = cursor.fetchone()['total']
        
        # New users this month
        cursor.execute("""
            SELECT COUNT(*) as count FROM users 
            WHERE role != 'admin' 
            AND YEAR(created_at) = YEAR(CURDATE()) 
            AND MONTH(created_at) = MONTH(CURDATE())
        """)
        new_users_month = cursor.fetchone()['count']
        
        # New users last month
        cursor.execute("""
            SELECT COUNT(*) as count FROM users 
            WHERE role != 'admin' 
            AND YEAR(created_at) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
            AND MONTH(created_at) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
        """)
        new_users_last_month = cursor.fetchone()['count']
        
        # Users by role
        cursor.execute("""
            SELECT role, COUNT(*) as count 
            FROM users 
            WHERE role != 'admin'
            GROUP BY role
        """)
        users_by_role = cursor.fetchall()
        
        # User growth (last 12 months)
        cursor.execute("""
            SELECT 
                DATE_FORMAT(created_at, '%Y-%m') as month,
                COUNT(*) as new_users
            FROM users
            WHERE role != 'admin'
            AND DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
            GROUP BY DATE_FORMAT(created_at, '%Y-%m')
            ORDER BY month DESC
            LIMIT 12
        """)
        user_growth = cursor.fetchall()
        
        # === ORDER STATISTICS ===
        # Order status breakdown
        # Build order date filter (without alias since no JOIN)
        order_date_filter = ""
        order_date_params = []
        if date_from and date_to:
            order_date_filter = "AND DATE(created_at) BETWEEN %s AND %s"
            order_date_params = [date_from, date_to]
        elif date_from:
            order_date_filter = "AND DATE(created_at) >= %s"
            order_date_params = [date_from]
        elif date_to:
            order_date_filter = "AND DATE(created_at) <= %s"
            order_date_params = [date_to]
        
        cursor.execute(f"""
            SELECT 
                status,
                COUNT(*) as count,
                COALESCE(SUM(total_amount), 0) as total_amount
            FROM orders
            WHERE 1=1 {order_date_filter}
            GROUP BY status
        """, order_date_params)
        order_status_breakdown = cursor.fetchall()
        
        # Orders by day (last 30 days or date range)
        # Use order_date_filter since it's the same table structure
        if date_from or date_to:
            daily_orders_filter = order_date_filter
            daily_orders_params = order_date_params
        else:
            daily_orders_filter = "AND DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)"
            daily_orders_params = []
        
        cursor.execute(f"""
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as orders,
                COALESCE(SUM(total_amount), 0) as sales
            FROM orders
            WHERE 1=1 {daily_orders_filter}
            GROUP BY DATE(created_at)
            ORDER BY date DESC
            LIMIT 30
        """, daily_orders_params)
        daily_orders = cursor.fetchall()
        
        # === REVENUE REPORT ===
        # Total revenue (all orders)
        # Use order_date_filter since it's the same table
        cursor.execute(f"""
            SELECT 
                COALESCE(SUM(total_amount), 0) as total_revenue,
                COALESCE(SUM(admin_commission), 0) as total_admin_commission,
                COALESCE(SUM(total_amount - admin_commission), 0) as total_seller_earnings
            FROM orders
            WHERE payment_status = 'paid' AND status != 'cancelled' {order_date_filter}
        """, order_date_params)
        revenue_data = cursor.fetchone()
        
        # Revenue by month
        if date_from or date_to:
            monthly_revenue_filter = order_date_filter
            monthly_revenue_params = order_date_params
        else:
            monthly_revenue_filter = "AND DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)"
            monthly_revenue_params = []
        
        cursor.execute(f"""
            SELECT 
                DATE_FORMAT(created_at, '%Y-%m') as month,
                COALESCE(SUM(total_amount), 0) as revenue,
                COALESCE(SUM(admin_commission), 0) as admin_commission
            FROM orders
            WHERE payment_status = 'paid' AND status != 'cancelled' {monthly_revenue_filter}
            GROUP BY DATE_FORMAT(created_at, '%Y-%m')
            ORDER BY month DESC
            LIMIT 12
        """, monthly_revenue_params)
        monthly_revenue = cursor.fetchall()
        
        # === SELLER PERFORMANCE ===
        # Top sellers
        # Build seller date filter for JOIN condition
        seller_date_filter = ""
        if date_from and date_to:
            seller_date_filter = "AND DATE(o.created_at) BETWEEN %s AND %s"
        elif date_from:
            seller_date_filter = "AND DATE(o.created_at) >= %s"
        elif date_to:
            seller_date_filter = "AND DATE(o.created_at) <= %s"
        
        cursor.execute(f"""
            SELECT 
                u.id as seller_id,
                u.name as seller_name,
                COUNT(DISTINCT o.id) as total_orders,
                COALESCE(SUM(o.total_amount), 0) as total_sales,
                COALESCE(SUM(o.total_amount - o.admin_commission), 0) as seller_earnings
            FROM users u
            LEFT JOIN orders o ON u.id = o.seller_id AND o.status != 'cancelled' {seller_date_filter}
            WHERE u.role = 'seller'
            GROUP BY u.id, u.name
            ORDER BY total_sales DESC
            LIMIT 10
        """, params)
        top_sellers = cursor.fetchall()
        
        # Seller statistics
        cursor.execute("SELECT COUNT(*) as total FROM users WHERE role = 'seller'")
        total_sellers = cursor.fetchone()['total']
        
        cursor.execute(f"""
            SELECT COUNT(DISTINCT seller_id) as active 
            FROM orders 
            WHERE status != 'cancelled' {order_date_filter}
        """, order_date_params)
        active_sellers = cursor.fetchone()['active']
        
        # === RIDER PERFORMANCE ===
        # Rider statistics
        cursor.execute("SELECT COUNT(*) as total FROM users WHERE role = 'rider'")
        total_riders = cursor.fetchone()['total']
        
        # Build delivery date filter
        delivery_date_filter = ""
        if date_from and date_to:
            delivery_date_filter = "AND DATE(d.created_at) BETWEEN %s AND %s"
        elif date_from:
            delivery_date_filter = "AND DATE(d.created_at) >= %s"
        elif date_to:
            delivery_date_filter = "AND DATE(d.created_at) <= %s"
        
        cursor.execute(f"""
            SELECT 
                COUNT(*) as total_deliveries,
                COUNT(CASE WHEN status = 'delivered' THEN 1 END) as completed,
                COUNT(CASE WHEN status IN ('pending', 'assigned', 'in_transit') THEN 1 END) as active,
                COALESCE(AVG(CASE WHEN completed_at IS NOT NULL AND pickup_time IS NOT NULL 
                    THEN TIMESTAMPDIFF(MINUTE, pickup_time, completed_at) END), 0) as avg_delivery_time
            FROM deliveries d
            WHERE 1=1 {delivery_date_filter}
        """, params)
        rider_stats = cursor.fetchone()
        
        # Top riders
        cursor.execute(f"""
            SELECT 
                u.id as rider_id,
                u.name as rider_name,
                COUNT(d.id) as deliveries,
                COUNT(CASE WHEN d.status = 'delivered' THEN 1 END) as completed,
                COALESCE(SUM(d.base_fee + d.distance_bonus + d.tips + d.peak_bonus), 0) as total_earnings
            FROM users u
            LEFT JOIN deliveries d ON u.id = d.rider_id {delivery_date_filter}
            WHERE u.role = 'rider'
            GROUP BY u.id, u.name
            ORDER BY deliveries DESC
            LIMIT 10
        """, params)
        top_riders = cursor.fetchall()
        
        return jsonify({
            'success': True,
            'reports': {
                'sales': {
                    'total_sales': float(sales_data['total_sales']),
                    'total_orders': sales_data['total_orders'],
                    'total_items_sold': sales_data['total_items_sold'],
                    'monthly_data': monthly_sales
                },
                'users': {
                    'total_users': total_users,
                    'new_users_month': new_users_month,
                    'new_users_last_month': new_users_last_month,
                    'users_by_role': users_by_role,
                    'user_growth': user_growth
                },
                'orders': {
                    'status_breakdown': order_status_breakdown,
                    'daily_data': daily_orders
                },
                'revenue': {
                    'total_revenue': float(revenue_data['total_revenue']),
                    'total_admin_commission': float(revenue_data['total_admin_commission']),
                    'total_seller_earnings': float(revenue_data['total_seller_earnings']),
                    'monthly_data': monthly_revenue
                },
                'sellers': {
                    'total_sellers': total_sellers,
                    'active_sellers': active_sellers,
                    'top_sellers': top_sellers
                },
                'riders': {
                    'total_riders': total_riders,
                    'total_deliveries': rider_stats['total_deliveries'],
                    'completed_deliveries': rider_stats['completed'],
                    'active_deliveries': rider_stats['active'],
                    'avg_delivery_time': float(rider_stats['avg_delivery_time']),
                    'top_riders': top_riders
                }
            }
        })
        
    except Exception as e:
        error_msg = str(e)
        print(f"Error generating admin reports: {error_msg}")
        import traceback
        traceback.print_exc()  # Print full traceback for debugging
        return jsonify({
            'error': f'Failed to generate reports: {error_msg}',
            'details': str(e) if hasattr(e, '__str__') else 'Unknown error'
        }), 500
    finally:
        cursor.close()
        connection.close()

# Ensure DB migrations run even when app is started via WSGI/Flask CLI (Flask 3 removed before_first_request)
_init_done = False
@app.before_request
def _ensure_db():
    global _init_done
    if not _init_done:
        try:
            init_database()
            _init_done = True
        except Exception as e:
            print(f"[INIT] init_database failed: {e}")

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    init_database()
    app.run(host="0.0.0.0", port=port)
