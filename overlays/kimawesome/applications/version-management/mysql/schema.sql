-- Create database if not exists
CREATE DATABASE IF NOT EXISTS version_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE version_management;

-- Create applications table
CREATE TABLE IF NOT EXISTS applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  packaging_type VARCHAR(100) NOT NULL,
  version_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create clusters table
CREATE TABLE IF NOT EXISTS clusters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create application_cluster_assignments table
CREATE TABLE IF NOT EXISTS application_cluster_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  application_id INT NOT NULL,
  cluster_id INT NOT NULL,
  repo VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  FOREIGN KEY (cluster_id) REFERENCES clusters(id) ON DELETE CASCADE,
  UNIQUE KEY unique_app_cluster (application_id, cluster_id)
);

-- Create update_cycles table
CREATE TABLE IF NOT EXISTS update_cycles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  responsible_email VARCHAR(255) NOT NULL,
  status ENUM('pending', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending',
  start_date TIMESTAMP NULL,
  end_date TIMESTAMP NULL,
  notes TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create update_cycle_items table (linking applications, clusters, and versions)
CREATE TABLE IF NOT EXISTS update_cycle_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  update_cycle_id INT NOT NULL,
  application_id INT NOT NULL,
  cluster_id INT NOT NULL,
  current_version VARCHAR(100) NOT NULL,
  target_version VARCHAR(100) NOT NULL,
  status ENUM('pending', 'in_progress', 'completed', 'failed', 'skipped') DEFAULT 'pending',
  notes TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (update_cycle_id) REFERENCES update_cycles(id) ON DELETE CASCADE,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  FOREIGN KEY (cluster_id) REFERENCES clusters(id) ON DELETE CASCADE
);

-- Insert some sample data
INSERT INTO applications (name, packaging_type, version_url) VALUES 
('Frontend App', 'Docker', 'https://app.example.com/v1.2.3'),
('Backend API', 'Helm Chart', 'https://api.example.com/v2.1.0'),
('Database', 'Docker Compose', 'https://db.example.com/v1.0.0'),
('Monitoring', 'Helm Chart', 'https://monitoring.example.com/v1.5.0');

INSERT INTO clusters (name) VALUES 
('Production'),
('Staging'),
('Development');

-- Insert application-cluster assignments
INSERT INTO application_cluster_assignments (application_id, cluster_id, repo) VALUES 
(1, 1, 'https://github.com/company/frontend'), -- Frontend App in Production
(1, 2, 'https://github.com/company/frontend'), -- Frontend App in Staging
(1, 3, 'https://github.com/company/frontend'), -- Frontend App in Development
(2, 1, 'https://github.com/company/backend'), -- Backend API in Production
(2, 2, 'https://github.com/company/backend'), -- Backend API in Staging
(2, 3, 'https://github.com/company/backend'), -- Backend API in Development
(3, 1, 'https://github.com/company/database'), -- Database in Production
(3, 2, 'https://github.com/company/database'), -- Database in Staging
(4, 1, 'https://github.com/company/monitoring'), -- Monitoring in Production
(4, 2, 'https://github.com/company/monitoring'); -- Monitoring in Staging (not in Development)

INSERT INTO update_cycles (name, responsible_email, status, start_date, notes) VALUES 
('Q1 2024 Update Cycle', 'john.doe@company.com', 'in_progress', NOW(), 'Major version updates for all applications'),
('Security Patches March 2024', 'jane.smith@company.com', 'pending', NULL, 'Security updates for critical applications'); 

