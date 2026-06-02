-- =====================================================================
-- SYNTHETIC TEST FIXTURE — NOT REAL LEGACY DATA
-- =====================================================================
-- Purpose: exercise seal.py behavior only (copy + sha256 sidecar +
--          chmod 0444 + overwrite refusal).
-- This file does NOT come from footbag.org. It must never be treated as
-- legacy raw data and must never be placed under raw/.
-- Safe to commit. Values below are invented for testing.
-- =====================================================================

CREATE TABLE `news` (
  `NewsID` int(11) NOT NULL AUTO_INCREMENT,
  `NewsDate` datetime DEFAULT NULL,
  `NewsPriority` int(11) DEFAULT '0',
  `NewsTitle` varchar(255) DEFAULT NULL,
  `NewsBody` text,
  PRIMARY KEY (`NewsID`)
);

INSERT INTO `news` VALUES
  (1,'2001-01-01 00:00:00',5,'Synthetic headline one','Synthetic body text one.'),
  (2,'2002-02-02 00:00:00',3,'Synthetic headline two','Synthetic body text two.');
