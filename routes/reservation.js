const express = require('express')
const cors = require('cors')
const {
    createReservation,
    getAllReservations,
    getReservationById,
    updateReservationStatus,
    deleteReservation
} = require('../controller/reservation')

const router = express.Router()
router.use(cors())

// Define reservation routes
router.post('/createReservation', createReservation)       // Create a new reservation
router.get('/getReservations', getAllReservations)        // Get all reservations
router.get('/getReservation/:id', getReservationById)      // Get a single reservation by ID
router.put('/updateReservationStatus/:id', updateReservationStatus) // Update reservation status (e.g., confirm, cancel)
router.delete('/deleteReservation/:id', deleteReservation)    // Delete a reservation

module.exports = router