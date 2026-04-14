-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 13, 2025 at 01:51 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `ecommerce`
--

-- --------------------------------------------------------

--
-- Table structure for table `applications`
--

CREATE TABLE `applications` (
  `id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `application_type` enum('seller','rider') NOT NULL,
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `business_name` varchar(255) DEFAULT NULL,
  `business_registration` varchar(100) DEFAULT NULL,
  `tax_id` varchar(50) DEFAULT NULL,
  `experience` text DEFAULT NULL,
  `vehicle_type` varchar(50) DEFAULT NULL,
  `license_number` varchar(50) DEFAULT NULL,
  `documents` text DEFAULT NULL,
  `admin_notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `id_documents_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`id_documents_json`)),
  `business_documents_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`business_documents_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `applications`
--

INSERT INTO `applications` (`id`, `user_id`, `application_type`, `status`, `business_name`, `business_registration`, `tax_id`, `experience`, `vehicle_type`, `license_number`, `documents`, `admin_notes`, `created_at`, `updated_at`, `id_documents_json`, `business_documents_json`) VALUES
(1, 3, 'seller', 'approved', 'Abby BOtique', '43378', '45254', '{\"business_type\": \"Online Botique\", \"business_phone\": \"09122036882\", \"business_email\": \"ramoskurt@gmail.com\", \"street_address\": \"Langka Street\", \"city\": \"043426000\", \"state\": \"\", \"zip_code\": \"\", \"categories\": \"\", \"description\": \"adwadwadawdadwa\", \"website\": \"\", \"years_in_business\": \"4\", \"id_documents\": [\"/static/uploads/applications/seller/3/id_20251108_223343_Screenshot_2025-11-03_105228.PNG\"], \"business_documents\": [\"/static/uploads/applications/seller/3/biz_20251108_223343_a5548c56-80f2-460f-9dcf-c79a3218b69c.JPG\"]}', NULL, NULL, NULL, NULL, '2025-11-08 14:33:43', '2025-11-08 14:34:01', '[\"/static/uploads/applications/seller/3/id_20251108_223343_Screenshot_2025-11-03_105228.PNG\"]', '[\"/static/uploads/applications/seller/3/biz_20251108_223343_a5548c56-80f2-460f-9dcf-c79a3218b69c.JPG\"]');

-- --------------------------------------------------------

--
-- Table structure for table `cart`
--

CREATE TABLE `cart` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `quantity` int(11) NOT NULL DEFAULT 1,
  `size` varchar(10) DEFAULT NULL,
  `color` varchar(50) DEFAULT NULL,
  `price` decimal(10,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `chat_conversations`
--

CREATE TABLE `chat_conversations` (
  `id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `order_number` varchar(50) DEFAULT NULL,
  `seller_id` int(11) NOT NULL,
  `buyer_id` int(11) NOT NULL,
  `participant_name` varchar(255) NOT NULL,
  `status` enum('active','closed','archived') DEFAULT 'active',
  `last_message_time` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `chat_conversations`
--

INSERT INTO `chat_conversations` (`id`, `order_id`, `order_number`, `seller_id`, `buyer_id`, `participant_name`, `status`, `last_message_time`, `created_at`, `updated_at`) VALUES
(1, 2, 'ORD-20251108-D989A271', 3, 2, 'Abby Prado', 'active', '2025-11-08 15:22:06', '2025-11-08 15:11:09', '2025-11-08 15:22:06'),
(2, 1, 'ORD-20251108-304187D3', 3, 2, 'Ramos, Kurt Andrew', 'active', NULL, '2025-11-11 17:43:30', '2025-11-11 17:43:30');

-- --------------------------------------------------------

--
-- Table structure for table `chat_messages`
--

CREATE TABLE `chat_messages` (
  `id` int(11) NOT NULL,
  `conversation_id` int(11) NOT NULL,
  `sender_id` int(11) NOT NULL,
  `sender_type` enum('seller','buyer','rider') NOT NULL,
  `content` text NOT NULL,
  `message_type` enum('text','image','file','system') DEFAULT 'text',
  `file_url` varchar(500) DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `chat_messages`
--

INSERT INTO `chat_messages` (`id`, `conversation_id`, `sender_id`, `sender_type`, `content`, `message_type`, `file_url`, `is_read`, `created_at`) VALUES
(1, 1, 2, 'buyer', 'ano na boy', 'text', NULL, 0, '2025-11-08 15:11:09'),
(2, 1, 4, 'rider', 'san kayo boss', 'text', NULL, 1, '2025-11-08 15:22:02'),
(3, 1, 4, 'rider', 'lapit na', 'text', NULL, 1, '2025-11-08 15:22:06');

-- --------------------------------------------------------

--
-- Table structure for table `deliveries`
--

CREATE TABLE `deliveries` (
  `id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `rider_id` int(11) DEFAULT NULL,
  `delivery_address` text DEFAULT NULL,
  `delivery_fee` decimal(10,2) DEFAULT 0.00,
  `base_fee` decimal(10,2) DEFAULT 50.00,
  `distance_bonus` decimal(10,2) DEFAULT 0.00,
  `tips` decimal(10,2) DEFAULT 0.00,
  `peak_bonus` decimal(10,2) DEFAULT 0.00,
  `estimated_time` varchar(50) DEFAULT NULL,
  `actual_time` int(11) DEFAULT 0,
  `distance` decimal(10,2) DEFAULT 0.00,
  `pickup_address` text DEFAULT NULL,
  `pickup_time` timestamp NULL DEFAULT NULL,
  `delivery_time` timestamp NULL DEFAULT NULL,
  `rating` decimal(3,2) DEFAULT 0.00,
  `customer_rating` decimal(3,2) DEFAULT 0.00,
  `customer_feedback` text DEFAULT NULL,
  `delivery_type` enum('standard','express','same_day','scheduled') DEFAULT 'standard',
  `priority` enum('low','normal','high','urgent') DEFAULT 'normal',
  `status` enum('pending','assigned','picked_up','in_transit','delivered','cancelled') DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `assigned_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `deliveries`
--

INSERT INTO `deliveries` (`id`, `order_id`, `rider_id`, `delivery_address`, `delivery_fee`, `base_fee`, `distance_bonus`, `tips`, `peak_bonus`, `estimated_time`, `actual_time`, `distance`, `pickup_address`, `pickup_time`, `delivery_time`, `rating`, `customer_rating`, `customer_feedback`, `delivery_type`, `priority`, `status`, `created_at`, `assigned_at`, `completed_at`) VALUES
(1, 1, 4, 'block 4, Pagsawitan, Santa Cruz, Laguna, CALABARZON, 4009, Philippines, Santa Cruz 4009, Philippines', 50.00, 50.00, 0.00, 0.00, 0.00, '30-45 minutes', 0, 5.00, 'Grande, Main Branch', '2025-11-08 15:22:19', '2025-11-08 15:22:30', 0.00, 0.00, NULL, 'standard', 'normal', 'delivered', '2025-11-08 15:08:55', '2025-11-08 15:21:41', '2025-11-08 15:22:30'),
(2, 2, 4, 'block 4, Pagsawitan, Santa Cruz, Laguna, CALABARZON, 4009, Philippines, Santa Cruz 4009, Philippines', 50.00, 50.00, 0.00, 0.00, 0.00, '30-45 minutes', 0, 5.00, 'Grande, Main Branch', '2025-11-08 15:22:20', '2025-11-08 15:22:28', 0.00, 0.00, NULL, 'standard', 'normal', 'delivered', '2025-11-08 15:08:58', '2025-11-08 15:21:43', '2025-11-08 15:22:28');

-- --------------------------------------------------------

--
-- Table structure for table `delivery_proof`
--

CREATE TABLE `delivery_proof` (
  `id` int(11) NOT NULL,
  `delivery_id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `rider_id` int(11) NOT NULL,
  `photo_url` varchar(500) DEFAULT NULL,
  `signature_data` text DEFAULT NULL,
  `delivery_notes` text DEFAULT NULL,
  `customer_present` tinyint(1) DEFAULT 0,
  `customer_id_verified` tinyint(1) DEFAULT 0,
  `proof_type` enum('photo','signature','customer_confirmation','combined') DEFAULT 'combined',
  `location_lat` decimal(10,8) DEFAULT NULL,
  `location_lng` decimal(11,8) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `delivery_ratings`
--

CREATE TABLE `delivery_ratings` (
  `id` int(11) NOT NULL,
  `delivery_id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `rider_id` int(11) NOT NULL,
  `rating` int(11) NOT NULL CHECK (`rating` >= 1 and `rating` <= 5),
  `comment` text DEFAULT NULL,
  `delivery_speed_rating` int(11) DEFAULT 5,
  `communication_rating` int(11) DEFAULT 5,
  `professionalism_rating` int(11) DEFAULT 5,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `type` varchar(50) NOT NULL,
  `message` text NOT NULL,
  `image_url` varchar(255) DEFAULT NULL,
  `reference_id` int(11) DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `notifications`
--

INSERT INTO `notifications` (`id`, `user_id`, `type`, `message`, `image_url`, `reference_id`, `is_read`, `created_at`, `updated_at`) VALUES
(1, 2, 'order_confirmed', 'Your order #ORD-20251108-304187D3 has been confirmed by the seller.', '/static/uploads/products/b0aa1ec6-9185-411c-bfda-615d3092b4d4_SCREEN2.PNG', 1, 1, '2025-11-08 15:08:55', '2025-11-08 15:31:12'),
(2, 2, 'order_confirmed', 'Your order #ORD-20251108-D989A271 has been confirmed by the seller.', '/static/uploads/products/b0aa1ec6-9185-411c-bfda-615d3092b4d4_SCREEN2.PNG', 2, 1, '2025-11-08 15:08:58', '2025-11-08 15:31:12'),
(3, 2, 'order_prepared', 'Your order #ORD-20251108-D989A271 is being prepared for shipment.', '/static/uploads/products/b0aa1ec6-9185-411c-bfda-615d3092b4d4_SCREEN2.PNG', 2, 1, '2025-11-08 15:09:02', '2025-11-08 15:31:12'),
(4, 2, 'order_prepared', 'Your order #ORD-20251108-304187D3 is being prepared for shipment.', '/static/uploads/products/b0aa1ec6-9185-411c-bfda-615d3092b4d4_SCREEN2.PNG', 1, 1, '2025-11-08 15:09:06', '2025-11-08 15:31:12'),
(5, 2, 'order_shipped', 'Your order #ORD-20251108-D989A271 has been shipped and is on its way!', '/static/uploads/products/b0aa1ec6-9185-411c-bfda-615d3092b4d4_SCREEN2.PNG', 2, 1, '2025-11-08 15:09:43', '2025-11-08 15:31:12'),
(6, 2, 'order_shipped', 'Your order #ORD-20251108-304187D3 has been shipped and is on its way!', '/static/uploads/products/b0aa1ec6-9185-411c-bfda-615d3092b4d4_SCREEN2.PNG', 1, 1, '2025-11-08 15:09:47', '2025-11-08 15:10:54'),
(7, 3, 'delivery_assigned', '🚚 Rider Rider Fast has been assigned to order #ORD-20251108-304187D3 and will pick up your package soon!', NULL, 1, 0, '2025-11-08 15:21:41', '2025-11-08 15:21:41'),
(8, 2, 'delivery_started', '📦 Your order #ORD-20251108-304187D3 has been assigned to rider Rider Fast for delivery!', NULL, 1, 1, '2025-11-08 15:21:41', '2025-11-08 15:31:12'),
(9, 3, 'delivery_assigned', '🚚 Rider Rider Fast has been assigned to order #ORD-20251108-D989A271 and will pick up your package soon!', NULL, 2, 0, '2025-11-08 15:21:43', '2025-11-08 15:21:43'),
(10, 2, 'delivery_started', '📦 Your order #ORD-20251108-D989A271 has been assigned to rider Rider Fast for delivery!', NULL, 2, 1, '2025-11-08 15:21:43', '2025-11-08 15:31:12'),
(11, 2, 'delivery_picked_up', 'Your order #ORD-20251108-304187D3 has been picked up by the rider', NULL, 1, 1, '2025-11-08 15:22:19', '2025-11-08 15:31:12'),
(12, 2, 'delivery_picked_up', 'Your order #ORD-20251108-D989A271 has been picked up by the rider', NULL, 2, 1, '2025-11-08 15:22:20', '2025-11-08 15:31:12'),
(13, 2, 'delivery_in_transit', 'Your order #ORD-20251108-D989A271 is on the way', NULL, 2, 1, '2025-11-08 15:22:21', '2025-11-08 15:31:12'),
(14, 2, 'delivery_in_transit', 'Your order #ORD-20251108-304187D3 is on the way', NULL, 1, 1, '2025-11-08 15:22:22', '2025-11-08 15:31:01'),
(15, 2, 'delivery_delivered', 'Your order #ORD-20251108-D989A271 has been delivered successfully', NULL, 2, 1, '2025-11-08 15:22:28', '2025-11-08 15:22:57'),
(16, 2, 'delivery_delivered', 'Your order #ORD-20251108-304187D3 has been delivered successfully', NULL, 1, 1, '2025-11-08 15:22:30', '2025-11-08 15:22:51'),
(17, 2, 'order_cancelled', 'Your order #ORD-20251112-D1C6D9DC has been cancelled.', '/static/uploads/products/b0aa1ec6-9185-411c-bfda-615d3092b4d4_SCREEN2.PNG', 3, 1, '2025-11-11 18:23:50', '2025-11-11 18:25:04'),
(18, 2, 'order_cancelled', 'Your order #ORD-20251112-40B85522 has been cancelled.', '/static/uploads/products/c85107a5-a82e-4cf2-a1e9-c36801f08ce2_Screenshot_2025-08-29_222145.png', 4, 1, '2025-11-11 18:34:20', '2025-11-12 23:02:49'),
(19, 2, 'price_drop', 'Good news! sheesh dropped to ₱360.00.', '/static/uploads/products/6f34ac8b-fd59-4bb9-8842-c336b57f77fe_Screenshot_2025-08-29_222105.png', 2, 0, '2025-11-13 00:36:06', '2025-11-13 00:36:06'),
(20, 2, 'price_drop', 'Price drop! sheesh is now 20% off.', '/static/uploads/products/c85107a5-a82e-4cf2-a1e9-c36801f08ce2_Screenshot_2025-08-29_222145.png', 2, 0, '2025-11-13 00:36:06', '2025-11-13 00:36:06'),
(21, 2, 'price_drop', 'Price drop! sheesh is now 20% off.', '/static/uploads/products/d7177bb2-6c6d-4628-acec-d42caa91bf25_Screenshot_2025-08-29_223419.png', 2, 0, '2025-11-13 00:36:06', '2025-11-13 00:36:06'),
(22, 2, 'price_drop', 'Price drop! sheesh is now 20% off.', '/static/uploads/products/c85107a5-a82e-4cf2-a1e9-c36801f08ce2_Screenshot_2025-08-29_222145.png', 2, 0, '2025-11-13 00:36:06', '2025-11-13 00:36:06'),
(23, 2, 'price_drop', 'Price drop! sheesh is now 20% off.', '/static/uploads/products/c85107a5-a82e-4cf2-a1e9-c36801f08ce2_Screenshot_2025-08-29_222145.png', 2, 0, '2025-11-13 00:36:06', '2025-11-13 00:36:06'),
(24, 2, 'price_drop', 'Price drop! sheesh is now 20% off.', '/static/uploads/products/d7177bb2-6c6d-4628-acec-d42caa91bf25_Screenshot_2025-08-29_223419.png', 2, 0, '2025-11-13 00:36:16', '2025-11-13 00:36:16'),
(25, 2, 'price_drop', 'Price drop! Tae is now 50% off.', '/static/uploads/products/fc4aa7f7-278c-409a-8d71-fabc806a08c2_Screenshot_2025-08-29_232356.png', 1, 0, '2025-11-13 00:36:35', '2025-11-13 00:36:35'),
(26, 2, 'price_drop', 'Price drop! Tae is now 50% off.', '/static/uploads/products/9a2ce3a0-9045-42a1-bfd8-d4e214358432_Screenshot_2025-08-29_232521.png', 1, 0, '2025-11-13 00:36:35', '2025-11-13 00:36:35'),
(27, 2, 'price_drop', 'Price drop! Tae is now 50% off.', '/static/uploads/products/fc4aa7f7-278c-409a-8d71-fabc806a08c2_Screenshot_2025-08-29_232356.png', 1, 0, '2025-11-13 00:36:35', '2025-11-13 00:36:35'),
(28, 2, 'price_drop', 'Price drop! Tae is now 50% off.', '/static/uploads/products/9a2ce3a0-9045-42a1-bfd8-d4e214358432_Screenshot_2025-08-29_232521.png', 1, 0, '2025-11-13 00:36:35', '2025-11-13 00:36:35');

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--

CREATE TABLE `orders` (
  `id` int(11) NOT NULL,
  `order_number` varchar(50) NOT NULL,
  `buyer_id` int(11) DEFAULT NULL,
  `seller_id` int(11) NOT NULL,
  `rider_id` int(11) DEFAULT NULL,
  `full_name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `address` text NOT NULL,
  `city` varchar(100) NOT NULL,
  `postal_code` varchar(20) NOT NULL,
  `country` varchar(100) DEFAULT 'Philippines',
  `total_amount` decimal(10,2) NOT NULL,
  `size_color_stock` varchar(255) DEFAULT NULL,
  `payment_method` varchar(50) DEFAULT 'GCASH',
  `payment_provider` varchar(50) DEFAULT 'xendit',
  `payment_provider_id` varchar(255) DEFAULT NULL,
  `status` enum('pending','confirmed','prepared','shipped','delivered','cancelled','accepted_by_rider') DEFAULT 'pending',
  `payment_status` enum('pending','paid','failed','refunded') DEFAULT 'pending',
  `tracking_number` varchar(100) DEFAULT NULL,
  `special_notes` text DEFAULT NULL,
  `cancel_reason` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `orders`
--

INSERT INTO `orders` (`id`, `order_number`, `buyer_id`, `seller_id`, `rider_id`, `full_name`, `email`, `address`, `city`, `postal_code`, `country`, `total_amount`, `size_color_stock`, `payment_method`, `payment_provider`, `payment_provider_id`, `status`, `payment_status`, `tracking_number`, `special_notes`, `cancel_reason`, `created_at`, `updated_at`) VALUES
(1, 'ORD-20251108-304187D3', 2, 3, NULL, 'Abby Prado', 'ramoskurt109@gmail.com', 'block 4, Pagsawitan, Santa Cruz, Laguna, CALABARZON, 4009, Philippines', 'Santa Cruz', '4009', 'Philippines', 950.00, NULL, 'COD', 'xendit', NULL, 'delivered', 'paid', 'BF7973321004', 'ayusin mo ha', NULL, '2025-11-08 15:06:02', '2025-11-08 15:22:30'),
(2, 'ORD-20251108-D989A271', 2, 3, NULL, 'Abby Prado', 'ramoskurt109@gmail.com', 'block 4, Pagsawitan, Santa Cruz, Laguna, CALABARZON, 4009, Philippines', 'Santa Cruz', '4009', 'Philippines', 950.00, NULL, 'COD', 'xendit', NULL, 'delivered', 'paid', 'BF7453993256', '', NULL, '2025-11-08 15:08:28', '2025-11-08 15:22:28'),
(3, 'ORD-20251112-D1C6D9DC', 2, 3, NULL, 'Abby Prado', 'ramoskurt109@gmail.com', 'block 4, Anuling Lejos II, Mendez, Cavite, CALABARZON, 4009, Philippines', 'Mendez', '4009', 'Philippines', 950.00, NULL, 'COD', 'xendit', NULL, 'cancelled', 'paid', NULL, '', 'Found a better price', '2025-11-11 17:44:28', '2025-11-11 18:23:50'),
(4, 'ORD-20251112-40B85522', 2, 3, NULL, 'Abby Prado', 'ramoskurt109@gmail.com', 'block 4, Anuling Lejos II, Mendez, Cavite, CALABARZON, 4009, Philippines', 'Mendez', '4009', 'Philippines', 500.00, NULL, 'COD', 'xendit', NULL, 'cancelled', 'paid', NULL, '', 'wdwadawd', '2025-11-11 18:28:26', '2025-11-11 18:34:20');

-- --------------------------------------------------------

--
-- Table structure for table `order_items`
--

CREATE TABLE `order_items` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `product_name` varchar(255) NOT NULL,
  `quantity` int(11) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `size` varchar(10) DEFAULT NULL,
  `color` varchar(50) DEFAULT NULL,
  `subtotal` decimal(10,2) GENERATED ALWAYS AS (`quantity` * `price`) STORED
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `order_items`
--

INSERT INTO `order_items` (`id`, `order_id`, `product_id`, `product_name`, `quantity`, `price`, `size`, `color`) VALUES
(1, 1, 3, 'damn', 1, 900.00, 'XS', '#000000'),
(2, 2, 3, 'damn', 1, 900.00, 'S', '#000000'),
(3, 3, 3, 'damn', 1, 900.00, 'M', '#000000'),
(4, 4, 2, 'sheesh', 1, 450.00, 'S', '#0000FF');

-- --------------------------------------------------------

--
-- Table structure for table `order_status_history`
--

CREATE TABLE `order_status_history` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `status` varchar(50) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `order_status_history`
--

INSERT INTO `order_status_history` (`id`, `order_id`, `status`, `created_at`) VALUES
(1, 1, 'pending', '2025-11-08 15:06:02'),
(2, 2, 'pending', '2025-11-08 15:08:28'),
(3, 1, 'confirmed', '2025-11-08 15:08:55'),
(4, 2, 'confirmed', '2025-11-08 15:08:58'),
(5, 2, 'prepared', '2025-11-08 15:09:02'),
(6, 1, 'prepared', '2025-11-08 15:09:06'),
(7, 2, 'shipped', '2025-11-08 15:09:43'),
(8, 1, 'shipped', '2025-11-08 15:09:47'),
(9, 3, 'pending', '2025-11-11 17:44:28'),
(10, 3, 'cancelled', '2025-11-11 18:23:50'),
(11, 4, 'pending', '2025-11-11 18:28:26'),
(12, 4, 'cancelled', '2025-11-11 18:34:20');

-- --------------------------------------------------------

--
-- Table structure for table `password_reset_tokens`
--

CREATE TABLE `password_reset_tokens` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `token` varchar(255) NOT NULL,
  `expires_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `used` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `price_drop_alerts`
--

CREATE TABLE `price_drop_alerts` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `initial_price` decimal(10,2) DEFAULT NULL,
  `target_price` decimal(10,2) DEFAULT NULL,
  `notified_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `price_drop_alerts`
--

INSERT INTO `price_drop_alerts` (`id`, `user_id`, `product_id`, `initial_price`, `target_price`, `notified_at`, `created_at`) VALUES
(2, 2, 2, 400.00, NULL, '2025-11-13 00:36:06', '2025-11-11 18:28:22');

-- --------------------------------------------------------

--
-- Table structure for table `products`
--

CREATE TABLE `products` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL COMMENT 'Optional base price - variant prices are primary',
  `original_price` decimal(10,2) DEFAULT NULL,
  `category` varchar(100) DEFAULT NULL,
  `total_stock` int(11) DEFAULT 0,
  `is_active` tinyint(1) DEFAULT 1,
  `image_url` varchar(500) DEFAULT NULL,
  `discount_percentage` decimal(5,2) DEFAULT 0.00,
  `sizes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`sizes`)),
  `size_pricing` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`size_pricing`)),
  `seller_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `is_flash_sale` tinyint(1) DEFAULT 0,
  `flash_sale_start` datetime DEFAULT NULL,
  `flash_sale_end` datetime DEFAULT NULL,
  `flash_sale_status` enum('none','pending','approved','declined') DEFAULT 'none',
  `approval_status` enum('pending','approved','rejected') DEFAULT 'pending'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `products`
--

INSERT INTO `products` (`id`, `name`, `description`, `price`, `original_price`, `category`, `total_stock`, `is_active`, `image_url`, `discount_percentage`, `sizes`, `size_pricing`, `seller_id`, `created_at`, `is_flash_sale`, `flash_sale_start`, `flash_sale_end`, `flash_sale_status`, `approval_status`) VALUES
(1, 'Tae', 'adawdwaddwadwadwadwa', 500.00, NULL, 'Lingerie & Sleepwear', 3065, 1, '/static/uploads/products/abdc664e-8034-437e-93d4-b46af69d3f8f_Screenshot_2025-08-29_232326.png', 0.00, NULL, NULL, 3, '2025-11-08 14:36:35', 1, NULL, NULL, 'approved', 'approved'),
(2, 'sheesh', 'adwadwadwwadawdawdwada', 400.00, NULL, 'Tops & Blouses', 2900, 1, '/static/uploads/products/6f34ac8b-fd59-4bb9-8842-c336b57f77fe_Screenshot_2025-08-29_222105.png', 0.00, NULL, NULL, 3, '2025-11-08 14:38:17', 1, NULL, NULL, 'approved', 'approved'),
(3, 'damn', 'addwdddddddddddddd', 900.00, NULL, 'Lingerie & Sleepwear', 2698, 1, '/static/uploads/products/9eb1c763-6321-4ad4-b562-09624c063c57_SCREEN1.PNG', 0.00, NULL, NULL, 3, '2025-11-08 14:47:10', 0, NULL, NULL, 'approved', 'approved'),
(4, 'damn', 'addwdddddddddddddd', 900.00, NULL, 'Lingerie & Sleepwear', 2700, 0, '/static/uploads/products/6411102a-aa93-42b4-a974-39fb05198b31_SCREEN1.PNG', 0.00, NULL, NULL, 3, '2025-11-08 14:47:12', 1, NULL, NULL, 'approved', 'approved');

-- --------------------------------------------------------

--
-- Table structure for table `product_reviews`
--

CREATE TABLE `product_reviews` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `rating` int(11) NOT NULL CHECK (`rating` between 1 and 5),
  `comment` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `product_reviews`
--

INSERT INTO `product_reviews` (`id`, `user_id`, `product_id`, `order_id`, `rating`, `comment`, `created_at`, `updated_at`) VALUES
(1, 2, 3, 2, 5, 'wadwadwad', '2025-11-08 16:56:27', '2025-11-08 16:56:27'),
(2, 2, 3, 1, 4, 'bugijvbj', '2025-11-11 17:31:03', '2025-11-11 17:31:03');

-- --------------------------------------------------------

--
-- Table structure for table `product_review_media`
--

CREATE TABLE `product_review_media` (
  `id` int(11) NOT NULL,
  `review_id` int(11) NOT NULL,
  `media_type` enum('image','video') NOT NULL,
  `url` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `product_size_stock`
--

CREATE TABLE `product_size_stock` (
  `id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `size` varchar(10) NOT NULL,
  `color` varchar(50) NOT NULL,
  `color_name` varchar(100) DEFAULT NULL,
  `stock_quantity` int(11) NOT NULL DEFAULT 0,
  `price` decimal(10,2) NOT NULL,
  `discount_price` decimal(10,2) DEFAULT NULL,
  `image_order` int(11) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `product_size_stock`
--

INSERT INTO `product_size_stock` (`id`, `product_id`, `size`, `color`, `color_name`, `stock_quantity`, `price`, `discount_price`, `image_order`, `created_at`) VALUES
(1, 1, 'XS', '#ffc0cb', 'Pink', 600, 500.00, NULL, 0, '2025-11-08 14:36:35'),
(2, 1, 'XS', '#800080', 'Purple', 0, 500.00, NULL, 0, '2025-11-08 14:36:35'),
(3, 1, 'S', '#ffc0cb', 'Pink', 900, 550.00, 275.00, 0, '2025-11-08 14:36:35'),
(4, 1, 'S', '#800080', 'Purple', 990, 550.00, 275.00, 0, '2025-11-08 14:36:35'),
(5, 1, 'M', '#ffc0cb', 'Pink', 232, 600.00, 300.00, 0, '2025-11-08 14:36:35'),
(6, 1, 'M', '#800080', 'Purple', 343, 600.00, 300.00, 0, '2025-11-08 14:36:35'),
(7, 2, 'XS', '#0000ff', 'Blue', 233, 450.00, 360.00, 0, '2025-11-08 14:38:17'),
(8, 2, 'XS', '#ffc0cb', 'Pink', 323, 450.00, NULL, 0, '2025-11-08 14:38:17'),
(9, 2, 'M', '#0000ff', 'Blue', 323, 450.00, 360.00, 0, '2025-11-08 14:38:17'),
(10, 2, 'M', '#ffc0cb', 'Pink', 325, 450.00, 360.00, 0, '2025-11-08 14:38:17'),
(11, 2, 'S', '#0000ff', 'Blue', 899, 400.00, 320.00, 0, '2025-11-08 14:38:17'),
(12, 2, 'S', '#ffc0cb', 'Pink', 797, 400.00, 320.00, 0, '2025-11-08 14:38:17'),
(13, 3, 'XS', '#000000', 'Black', 899, 900.00, NULL, 0, '2025-11-08 14:47:10'),
(14, 3, 'S', '#000000', 'Black', 899, 900.00, 450.00, 0, '2025-11-08 14:47:10'),
(15, 3, 'M', '#000000', 'Black', 900, 900.00, 450.00, 0, '2025-11-08 14:47:10'),
(16, 4, 'XS', '#000000', 'Black', 900, 900.00, NULL, 0, '2025-11-08 14:47:12'),
(17, 4, 'S', '#000000', 'Black', 900, 900.00, NULL, 0, '2025-11-08 14:47:12'),
(18, 4, 'M', '#000000', 'Black', 900, 900.00, NULL, 0, '2025-11-08 14:47:12');

-- --------------------------------------------------------

--
-- Table structure for table `product_variant_images`
--

CREATE TABLE `product_variant_images` (
  `id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `size` varchar(20) DEFAULT NULL,
  `color` varchar(50) NOT NULL,
  `image_url` varchar(255) NOT NULL,
  `display_order` int(11) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `product_variant_images`
--

INSERT INTO `product_variant_images` (`id`, `product_id`, `size`, `color`, `image_url`, `display_order`, `created_at`) VALUES
(1, 1, NULL, 'default', '/static/uploads/products/abdc664e-8034-437e-93d4-b46af69d3f8f_Screenshot_2025-08-29_232326.png', 0, '2025-11-08 14:36:35'),
(2, 1, NULL, '#FFC0CB', '/static/uploads/products/fc4aa7f7-278c-409a-8d71-fabc806a08c2_Screenshot_2025-08-29_232356.png', 0, '2025-11-08 14:36:35'),
(3, 1, NULL, '#800080', '/static/uploads/products/9a2ce3a0-9045-42a1-bfd8-d4e214358432_Screenshot_2025-08-29_232521.png', 1, '2025-11-08 14:36:35'),
(4, 2, NULL, 'default', '/static/uploads/products/6f34ac8b-fd59-4bb9-8842-c336b57f77fe_Screenshot_2025-08-29_222105.png', 0, '2025-11-08 14:38:17'),
(5, 2, NULL, '#0000FF', '/static/uploads/products/c85107a5-a82e-4cf2-a1e9-c36801f08ce2_Screenshot_2025-08-29_222145.png', 0, '2025-11-08 14:38:17'),
(6, 2, NULL, '#FFC0CB', '/static/uploads/products/d7177bb2-6c6d-4628-acec-d42caa91bf25_Screenshot_2025-08-29_223419.png', 1, '2025-11-08 14:38:17'),
(7, 3, NULL, 'default', '/static/uploads/products/9eb1c763-6321-4ad4-b562-09624c063c57_SCREEN1.PNG', 0, '2025-11-08 14:47:10'),
(8, 3, NULL, '#000000', '/static/uploads/products/b0aa1ec6-9185-411c-bfda-615d3092b4d4_SCREEN2.PNG', 0, '2025-11-08 14:47:10'),
(9, 4, NULL, 'default', '/static/uploads/products/6411102a-aa93-42b4-a974-39fb05198b31_SCREEN1.PNG', 0, '2025-11-08 14:47:12'),
(10, 4, NULL, '#000000', '/static/uploads/products/fe854f5e-e17e-47c4-9874-c345996eb24c_SCREEN2.PNG', 0, '2025-11-08 14:47:12');

-- --------------------------------------------------------

--
-- Table structure for table `refund_requests`
--

CREATE TABLE `refund_requests` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `reason` text NOT NULL,
  `status` enum('pending','approved','rejected','processing','completed','failed') DEFAULT 'pending',
  `payment_provider_id` varchar(255) DEFAULT NULL,
  `payment_provider` varchar(50) DEFAULT NULL,
  `refund_provider_id` varchar(255) DEFAULT NULL COMMENT 'ID from payment provider for refund transaction',
  `admin_notes` text DEFAULT NULL,
  `processed_by` int(11) DEFAULT NULL COMMENT 'Admin user ID who processed the refund',
  `processed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `rider_payments`
--

CREATE TABLE `rider_payments` (
  `id` int(11) NOT NULL,
  `rider_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `deliveries_count` int(11) DEFAULT 0,
  `base_earnings` decimal(10,2) DEFAULT 0.00,
  `bonus_earnings` decimal(10,2) DEFAULT 0.00,
  `tips_total` decimal(10,2) DEFAULT 0.00,
  `payment_method` enum('bank_transfer','gcash','paymaya') DEFAULT 'gcash',
  `status` enum('pending','processing','completed','failed') DEFAULT 'pending',
  `processed_at` timestamp NULL DEFAULT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `stock_alerts`
--

CREATE TABLE `stock_alerts` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `size` varchar(10) DEFAULT NULL,
  `color` varchar(50) DEFAULT NULL,
  `notified_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `suffix` varchar(50) DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('buyer','seller','rider','admin') DEFAULT 'buyer',
  `status` enum('active','suspended','pending','available','busy','offline') DEFAULT 'active',
  `suspension_expires_at` datetime DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `gender` enum('male','female','other') DEFAULT NULL,
  `birthday` date DEFAULT NULL,
  `id_document` text DEFAULT NULL,
  `google_id` varchar(255) DEFAULT NULL,
  `login_method` enum('password','google') DEFAULT 'password',
  `location_lat` decimal(10,8) DEFAULT NULL,
  `location_lng` decimal(11,8) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `email_verified` tinyint(1) DEFAULT 0,
  `verification_code` varchar(6) DEFAULT NULL,
  `verification_code_expires_at` datetime DEFAULT NULL,
  `verification_attempts` int(11) DEFAULT 0,
  `last_login` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `profile_picture` text DEFAULT NULL,
  `id_document_front` text DEFAULT NULL,
  `id_document_back` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `name`, `suffix`, `email`, `password`, `role`, `status`, `suspension_expires_at`, `phone`, `address`, `gender`, `birthday`, `id_document`, `google_id`, `login_method`, `location_lat`, `location_lng`, `is_active`, `email_verified`, `verification_code`, `verification_code_expires_at`, `verification_attempts`, `last_login`, `created_at`, `updated_at`, `profile_picture`, `id_document_front`, `id_document_back`) VALUES
(1, 'Admin', NULL, 'admin@example.com', '@Admin123', 'admin', 'active', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'password', NULL, NULL, 1, 0, NULL, NULL, 0, '2025-11-08 14:42:49', '2025-11-08 14:26:22', '2025-11-08 14:42:49', NULL, NULL, NULL),
(2, 'Ramos, Kurt Andrew', NULL, 'ramoskurt109@gmail.com', 'google-oauth', 'buyer', 'active', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'password', NULL, NULL, 1, 0, NULL, NULL, 0, '2025-11-13 00:36:47', '2025-11-08 14:28:41', '2025-11-13 00:36:47', 'data:image/jpeg;base64,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', NULL, NULL),
(3, 'Abby Prado', NULL, 'abby@gmail.com', '123456Abby.', 'seller', 'active', NULL, '09123880045', 'Langka Street, 043426000', 'female', '2007-01-24', '/static/uploads/id_documents/idfront_20251108_223133_Screenshot_2025-11-03_105228.PNG', NULL, 'password', NULL, NULL, 1, 0, NULL, NULL, 0, '2025-11-13 00:35:43', '2025-11-08 14:31:34', '2025-11-13 00:35:43', NULL, '/static/uploads/id_documents/idfront_20251108_223133_Screenshot_2025-11-03_105228.PNG', '/static/uploads/id_documents/idback_20251108_223133_a5548c56-80f2-460f-9dcf-c79a3218b69c.JPG'),
(4, 'Rider Fast', NULL, 'rider_20251108231918_2724ed@local.test', 'Rider123!', 'rider', 'available', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'password', NULL, NULL, 1, 1, NULL, NULL, 0, '2025-11-11 17:43:14', '2025-11-08 15:19:18', '2025-11-11 17:43:14', NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `user_addresses`
--

CREATE TABLE `user_addresses` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `label` varchar(50) DEFAULT NULL,
  `contact_name` varchar(255) DEFAULT NULL,
  `contact_phone` varchar(50) DEFAULT NULL,
  `region_code` varchar(20) DEFAULT NULL,
  `region` varchar(255) DEFAULT NULL,
  `province_code` varchar(20) DEFAULT NULL,
  `province` varchar(255) DEFAULT NULL,
  `city_code` varchar(20) DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `barangay_code` varchar(20) DEFAULT NULL,
  `barangay` varchar(255) DEFAULT NULL,
  `street` text DEFAULT NULL,
  `postal_code` varchar(20) DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `is_default` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `user_addresses`
--

INSERT INTO `user_addresses` (`id`, `user_id`, `label`, `contact_name`, `contact_phone`, `region_code`, `region`, `province_code`, `province`, `city_code`, `city`, `barangay_code`, `barangay`, `street`, `postal_code`, `latitude`, `longitude`, `is_default`, `created_at`, `updated_at`) VALUES
(1, 2, 'Carmenchu', 'Abby Prado', '09150043244', '040000000', 'CALABARZON', '042100000', 'Cavite', '042114000', 'Mendez', '042114016', 'Anuling Lejos II', 'block 4', '4009', 14.34295000, 121.06711600, 1, '2025-11-08 15:05:42', '2025-11-11 17:37:32');

-- --------------------------------------------------------

--
-- Table structure for table `user_enforcement_actions`
--

CREATE TABLE `user_enforcement_actions` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `admin_id` int(11) NOT NULL,
  `action` enum('warn','suspend','disable','reinstate') NOT NULL,
  `reason` text DEFAULT NULL,
  `duration_days` int(11) DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `wishlist`
--

CREATE TABLE `wishlist` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `wishlist`
--

INSERT INTO `wishlist` (`id`, `user_id`, `product_id`, `created_at`) VALUES
(4, 2, 2, '2025-11-10 22:55:58'),
(5, 2, 1, '2025-11-10 22:55:59'),
(6, 2, 3, '2025-11-10 22:56:00');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `applications`
--
ALTER TABLE `applications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `cart`
--
ALTER TABLE `cart`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `product_id` (`product_id`);

--
-- Indexes for table `chat_conversations`
--
ALTER TABLE `chat_conversations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_order_chat` (`order_id`,`seller_id`,`buyer_id`),
  ADD KEY `seller_id` (`seller_id`),
  ADD KEY `buyer_id` (`buyer_id`);

--
-- Indexes for table `chat_messages`
--
ALTER TABLE `chat_messages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `conversation_id` (`conversation_id`),
  ADD KEY `sender_id` (`sender_id`);

--
-- Indexes for table `deliveries`
--
ALTER TABLE `deliveries`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_deliveries_order` (`order_id`),
  ADD KEY `idx_deliveries_rider_status_created` (`rider_id`,`status`,`created_at`),
  ADD KEY `idx_deliveries_status_created` (`status`,`created_at`);

--
-- Indexes for table `delivery_proof`
--
ALTER TABLE `delivery_proof`
  ADD PRIMARY KEY (`id`),
  ADD KEY `delivery_id` (`delivery_id`),
  ADD KEY `order_id` (`order_id`),
  ADD KEY `rider_id` (`rider_id`);

--
-- Indexes for table `delivery_ratings`
--
ALTER TABLE `delivery_ratings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `delivery_id` (`delivery_id`),
  ADD KEY `order_id` (`order_id`),
  ADD KEY `customer_id` (`customer_id`),
  ADD KEY `rider_id` (`rider_id`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_notifications_user_read_created` (`user_id`,`is_read`,`created_at`),
  ADD KEY `idx_notifications_user_id` (`user_id`,`id`);

--
-- Indexes for table `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `order_number` (`order_number`),
  ADD KEY `buyer_id` (`buyer_id`),
  ADD KEY `seller_id` (`seller_id`),
  ADD KEY `idx_orders_rider_status_updated` (`rider_id`,`status`,`updated_at`),
  ADD KEY `idx_orders_order_number` (`order_number`);

--
-- Indexes for table `order_items`
--
ALTER TABLE `order_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `order_id` (`order_id`);

--
-- Indexes for table `order_status_history`
--
ALTER TABLE `order_status_history`
  ADD PRIMARY KEY (`id`),
  ADD KEY `order_id` (`order_id`);

--
-- Indexes for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `token` (`token`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `price_drop_alerts`
--
ALTER TABLE `price_drop_alerts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_price_drop` (`user_id`,`product_id`,`target_price`),
  ADD KEY `idx_price_drop_product` (`product_id`,`notified_at`),
  ADD KEY `idx_price_drop_user` (`user_id`);

--
-- Indexes for table `products`
--
ALTER TABLE `products`
  ADD PRIMARY KEY (`id`),
  ADD KEY `seller_id` (`seller_id`);
ALTER TABLE `products` ADD FULLTEXT KEY `ft_products_name_desc_cat` (`name`,`description`,`category`);

--
-- Indexes for table `product_reviews`
--
ALTER TABLE `product_reviews`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_review` (`user_id`,`product_id`,`order_id`),
  ADD KEY `order_id` (`order_id`),
  ADD KEY `idx_product_reviews_product_created` (`product_id`,`created_at`),
  ADD KEY `idx_product_reviews_product_rating` (`product_id`,`rating`);

--
-- Indexes for table `product_review_media`
--
ALTER TABLE `product_review_media`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_prm_review` (`review_id`);

--
-- Indexes for table `product_size_stock`
--
ALTER TABLE `product_size_stock`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_product_size_color` (`product_id`,`size`,`color`);

--
-- Indexes for table `product_variant_images`
--
ALTER TABLE `product_variant_images`
  ADD PRIMARY KEY (`id`),
  ADD KEY `product_id` (`product_id`);

--
-- Indexes for table `refund_requests`
--
ALTER TABLE `refund_requests`
  ADD PRIMARY KEY (`id`),
  ADD KEY `order_id` (`order_id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `processed_by` (`processed_by`);

--
-- Indexes for table `rider_payments`
--
ALTER TABLE `rider_payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `rider_id` (`rider_id`);

--
-- Indexes for table `stock_alerts`
--
ALTER TABLE `stock_alerts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_stock_alert` (`user_id`,`product_id`,`size`,`color`),
  ADD KEY `idx_stock_alerts_product` (`product_id`,`notified_at`),
  ADD KEY `idx_stock_alerts_user` (`user_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD UNIQUE KEY `google_id` (`google_id`),
  ADD KEY `idx_email_verified` (`email_verified`),
  ADD KEY `idx_verification_code` (`verification_code`),
  ADD KEY `idx_users_role_status` (`role`,`status`);

--
-- Indexes for table `user_addresses`
--
ALTER TABLE `user_addresses`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `user_enforcement_actions`
--
ALTER TABLE `user_enforcement_actions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `admin_id` (`admin_id`);

--
-- Indexes for table `wishlist`
--
ALTER TABLE `wishlist`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_wishlist` (`user_id`,`product_id`),
  ADD KEY `product_id` (`product_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `applications`
--
ALTER TABLE `applications`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `cart`
--
ALTER TABLE `cart`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `chat_conversations`
--
ALTER TABLE `chat_conversations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `chat_messages`
--
ALTER TABLE `chat_messages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `deliveries`
--
ALTER TABLE `deliveries`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `delivery_proof`
--
ALTER TABLE `delivery_proof`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `delivery_ratings`
--
ALTER TABLE `delivery_ratings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `notifications`
--
ALTER TABLE `notifications`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=29;

--
-- AUTO_INCREMENT for table `orders`
--
ALTER TABLE `orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `order_items`
--
ALTER TABLE `order_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `order_status_history`
--
ALTER TABLE `order_status_history`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `price_drop_alerts`
--
ALTER TABLE `price_drop_alerts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `products`
--
ALTER TABLE `products`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `product_reviews`
--
ALTER TABLE `product_reviews`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `product_review_media`
--
ALTER TABLE `product_review_media`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `product_size_stock`
--
ALTER TABLE `product_size_stock`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=19;

--
-- AUTO_INCREMENT for table `product_variant_images`
--
ALTER TABLE `product_variant_images`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `refund_requests`
--
ALTER TABLE `refund_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `rider_payments`
--
ALTER TABLE `rider_payments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `stock_alerts`
--
ALTER TABLE `stock_alerts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `user_addresses`
--
ALTER TABLE `user_addresses`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `user_enforcement_actions`
--
ALTER TABLE `user_enforcement_actions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `wishlist`
--
ALTER TABLE `wishlist`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `applications`
--
ALTER TABLE `applications`
  ADD CONSTRAINT `applications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `cart`
--
ALTER TABLE `cart`
  ADD CONSTRAINT `cart_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `cart_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `chat_conversations`
--
ALTER TABLE `chat_conversations`
  ADD CONSTRAINT `chat_conversations_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `chat_conversations_ibfk_2` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `chat_conversations_ibfk_3` FOREIGN KEY (`buyer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `chat_messages`
--
ALTER TABLE `chat_messages`
  ADD CONSTRAINT `chat_messages_ibfk_1` FOREIGN KEY (`conversation_id`) REFERENCES `chat_conversations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `chat_messages_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `deliveries`
--
ALTER TABLE `deliveries`
  ADD CONSTRAINT `deliveries_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  ADD CONSTRAINT `deliveries_ibfk_2` FOREIGN KEY (`rider_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `delivery_proof`
--
ALTER TABLE `delivery_proof`
  ADD CONSTRAINT `delivery_proof_ibfk_1` FOREIGN KEY (`delivery_id`) REFERENCES `deliveries` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `delivery_proof_ibfk_2` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `delivery_proof_ibfk_3` FOREIGN KEY (`rider_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `delivery_ratings`
--
ALTER TABLE `delivery_ratings`
  ADD CONSTRAINT `delivery_ratings_ibfk_1` FOREIGN KEY (`delivery_id`) REFERENCES `deliveries` (`id`),
  ADD CONSTRAINT `delivery_ratings_ibfk_2` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  ADD CONSTRAINT `delivery_ratings_ibfk_3` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `delivery_ratings_ibfk_4` FOREIGN KEY (`rider_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `orders`
--
ALTER TABLE `orders`
  ADD CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`buyer_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `orders_ibfk_2` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `orders_ibfk_3` FOREIGN KEY (`rider_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `order_items`
--
ALTER TABLE `order_items`
  ADD CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `order_status_history`
--
ALTER TABLE `order_status_history`
  ADD CONSTRAINT `order_status_history_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  ADD CONSTRAINT `password_reset_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `price_drop_alerts`
--
ALTER TABLE `price_drop_alerts`
  ADD CONSTRAINT `price_drop_alerts_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `price_drop_alerts_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `products`
--
ALTER TABLE `products`
  ADD CONSTRAINT `products_ibfk_1` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `product_reviews`
--
ALTER TABLE `product_reviews`
  ADD CONSTRAINT `product_reviews_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `product_reviews_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `product_reviews_ibfk_3` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `product_review_media`
--
ALTER TABLE `product_review_media`
  ADD CONSTRAINT `product_review_media_ibfk_1` FOREIGN KEY (`review_id`) REFERENCES `product_reviews` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `product_size_stock`
--
ALTER TABLE `product_size_stock`
  ADD CONSTRAINT `product_size_stock_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `product_variant_images`
--
ALTER TABLE `product_variant_images`
  ADD CONSTRAINT `product_variant_images_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `refund_requests`
--
ALTER TABLE `refund_requests`
  ADD CONSTRAINT `refund_requests_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `refund_requests_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `refund_requests_ibfk_3` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `rider_payments`
--
ALTER TABLE `rider_payments`
  ADD CONSTRAINT `rider_payments_ibfk_1` FOREIGN KEY (`rider_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `stock_alerts`
--
ALTER TABLE `stock_alerts`
  ADD CONSTRAINT `stock_alerts_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `stock_alerts_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `user_addresses`
--
ALTER TABLE `user_addresses`
  ADD CONSTRAINT `user_addresses_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `user_enforcement_actions`
--
ALTER TABLE `user_enforcement_actions`
  ADD CONSTRAINT `user_enforcement_actions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `user_enforcement_actions_ibfk_2` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `wishlist`
--
ALTER TABLE `wishlist`
  ADD CONSTRAINT `wishlist_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `wishlist_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
