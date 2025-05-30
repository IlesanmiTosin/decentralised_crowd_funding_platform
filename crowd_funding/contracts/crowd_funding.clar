;; Decentralized Crowdfunding Platform

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-already-exists (err u102))
(define-constant err-invalid-amount (err u103))
(define-constant err-deadline-passed (err u104))
(define-constant err-goal-not-reached (err u105))
(define-constant err-already-claimed (err u106))
(define-constant  err-transfer-failed (err u107))

;; Additional Constants
(define-constant err-campaign-active (err u108))
(define-constant err-minimum-contribution (err u109))
(define-constant err-already-reported (err u110))
(define-constant err-milestone-not-found (err u111))

;; Additional Maps
(define-map campaign-milestones
    { campaign-id: uint, milestone-id: uint }
    {
        title: (string-utf8 100),
        description: (string-utf8 500),
        target-amount: uint,
        completed: bool,
        deadline: uint
    }
)

(define-map campaign-updates
    { campaign-id: uint, update-id: uint }
    {
        title: (string-utf8 100),
        content: (string-utf8 1000),
        timestamp: uint
    }
)

(define-map campaign-reports
    { campaign-id: uint, reporter: principal }
    {
        reason: (string-utf8 500),
        timestamp: uint,
        status: (string-ascii 20)
    }
)

(define-map campaign-stats 
    { campaign-id: uint }
    {
        unique-contributors: uint,
        avg-contribution: uint,
        largest-contribution: uint,
        updates-count: uint
    }
)

;; Data Variables for tracking
(define-data-var minimum-contribution uint u1000000) ;; 1 STX
(define-data-var platform-fee-percentage uint u25) ;; 0.25%

;; Data Maps
(define-map campaigns
  { campaign-id: uint }
  {
    owner: principal,
    goal: uint,
    raised: uint,
    deadline: uint,
    claimed: bool
  }
)

(define-map contributions
  { campaign-id: uint, contributor: principal }
  { amount: uint }
)

(define-map campaign-descriptions
  { campaign-id: uint }
  { description: (string-utf8 500) })


;; Variables
(define-data-var campaign-nonce uint u0)