const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const crypto = require("crypto");
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = process.env.DB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const stripe = require("stripe")(process.env.STRIPE_SECRET);

function generateTrackingId() {
  const prefix = "PS"; // optional prefix (Mal Shift)

  // Date: YYYYMMDD
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // Random 6-character hex (3 bytes)
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();

  return `${prefix}-${date}-${random}`;
}

async function run() {
  try {
    // await client.connect();
    // await client.db("admin").command({ ping: 1 })
    console.log("Connected to MongoDB successfully!");

    const db = client.db("assignment-11");
    const usersCollection = db.collection("users");
    const servicesCollection = db.collection("services");
    const bookingsCollection = db.collection("bookings");
    const paymentsCollection = db.collection("payments");
    const decoratorsCollection = db.collection("decorators");

    // Create user
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        const email = user.email;

        // default role
        user.role = user.role || "user";

        // Check if user already exists
        const existingUser = await usersCollection.findOne({ email });

        if (existingUser) {
          // Simply return the existing user (DO NOT block login)
          return res
            .status(200)
            .json({ message: "Login success", user: existingUser });
        }

        // Default decorator status
        if (user.role === "decorator") {
          user.status = "pending";
        }

        user.createdAt = new Date();

        const result = await usersCollection.insertOne(user);
        res.status(201).json({ message: "User created", user: result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Admin, users, rider role check
    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });

    // Get all users (with optional role filter)
    app.get("/users", async (req, res) => {
      try {
        const { role, status } = req.query;

        const filter = {};
        if (role) filter.role = role;
        if (status) filter.status = status;

        const users = await usersCollection.find(filter).toArray();
        res.json(users);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Update user role
    app.patch("/users/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const updateData = req.body;

        const query = { _id: new ObjectId(id) };
        const updateDoc = { $set: updateData };

        const result = await usersCollection.updateOne(query, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "User not found" });
        }

        res.json({ message: "User updated successfully" });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.patch("/users/:id/status", async (req, res) => {
      const id = req.params.id;
      const statusInfo = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: statusInfo.status,
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // Delete user
    app.delete("/users/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await usersCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "User not found" });
        }

        res.json({ message: "User deleted successfully" });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Services collections Api's

    app.post("/services", async (req, res) => {
      const servicesInfo = req.body;
      const result = await servicesCollection.insertOne(servicesInfo);
      res.send(result);
    });

    // Get services with optional search, category, and budget filter
    app.get("/services", async (req, res) => {
      try {
        const { search, category, minBudget, maxBudget } = req.query;

        const query = {};

        // Search by serviceName
        if (search) {
          query.serviceName = { $regex: search, $options: "i" }; // case-insensitive
        }

        // Filter by category
        if (category && category !== "all") {
          query.category = category;
        }

        // Filter by cost/budget
        if (minBudget || maxBudget) {
          query.cost = {};
          if (minBudget) query.cost.$gte = Number(minBudget);
          if (maxBudget) query.cost.$lte = Number(maxBudget);
        }

        const services = await servicesCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.send(services);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.get("/services/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await servicesCollection.findOne(query);
      res.send(result);
    });

    app.patch("/services/:id", async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: updateData,
      };
      const result = await servicesCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.delete("/services/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await servicesCollection.deleteOne(query);
      res.send(result);
    });

    // Bookings collection
    app.post("/bookings", async (req, res) => {
      const bookings = req.body;
      const trackingId = generateTrackingId();
      bookings.trackingId = trackingId;
      bookings.deliveryStatus = "assigned";
      const result = await bookingsCollection.insertOne(bookings);
      res.send(result);
    });

    app.get("/bookings", async (req, res) => {
      try {
        const { email, decoratorEmail, deliveryStatus } = req.query;

        const query = {};

        if (email) {
          query.userEmail = email;
        }
        if (decoratorEmail) {
          query.decoratorEmail = decoratorEmail;
        }
        if (deliveryStatus) {
          query.deliveryStatus = deliveryStatus;
        }

        const result = await bookingsCollection
          .find(query)
          .sort({ date: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.get("/bookings/role", async (req, res) => {
      try {
        const { deliveryStatus } = req.query;

        let filter = {};
        if (deliveryStatus) {
          filter.deliveryStatus = deliveryStatus;
        }

        const result = await bookingsCollection
          .find(filter)
          .sort({ date: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.delete("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingsCollection.deleteOne(query);
      res.send(result);
    });

    app.patch("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: updateData,
      };
      const result = await bookingsCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.patch("/bookings/:id/role", async (req, res) => {
      const id = req.params.id;
      const { decoratorName, decoratorEmail, decoratorStatus } = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          deliveryStatus: "materials-prepared",
          decoratorName: decoratorName,
          decoratorEmail: decoratorEmail,
          decoratorStatus: decoratorStatus,
          assignedAt: new Date(),
          ratings: 4.5,
        },
      };
      const result = await bookingsCollection.updateOne(query, updateDoc);

      res.send(result);
    });

    app.patch("/bookings/:id/status", async (req, res) => {
      const id = req.params.id;
      const statusInfo = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          deliveryStatus: statusInfo.deliveryStatus,
        },
      };

      const result = await bookingsCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // decorator
    app.get("/decorators", async (req, res) => {
      try {
        const { decoratorEmail } = req.query; // extract email string
        const query = {};

        if (decoratorEmail) {
          query.decoratorEmail = decoratorEmail;
        }

        const cursor = await decoratorsCollection.find(query).toArray();
        res.send(cursor);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // payment

    app.post("/payment-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost) * 100;

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: `Please pay for ${paymentInfo.parcelName}`,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: {
          parcelId: paymentInfo.parcelId,
          trackingId: paymentInfo.trackingId,
          serviceName: paymentInfo.parcelName, // <-- FIXED
        },
        customer_email: paymentInfo.senderEmail,
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });

      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };

      const paymentExit = await paymentsCollection.findOne(query);
      if (paymentExit) {
        return res.send({
          message: "already use",
          transactionId,
          trackingId: paymentExit.trackingId,
        });
      }

      const trackingId = session.metadata.trackingId;

      if (session.payment_status === "paid") {
        const id = session.metadata.parcelId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            paymentStatus: "paid",
            deliveryStatus: "planning-phase",
          },
        };
        const result = await bookingsCollection.updateOne(query, update);

        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          customerEmail: session.customer_email,
          parcelId: session.metadata.parcelId,
          parcelName: session.metadata.serviceName,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
          trackingId: trackingId,
        };

        const resultPayment = await paymentsCollection.insertOne(payment);

        // logTracking(trackingId, "parcel_paid");

        return res.send({
          success: true,
          modifyParcel: result,
          paymentInfo: resultPayment,
          trackingId: trackingId,
          transactionId: session.payment_intent,
        });

        // res.send(result);
      }

      return res.send({ success: false });
    });

    app.get("/payments", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.customerEmail = email;
      }
      const result = await paymentsCollection.find(query).toArray();
      res.send(result);
    });
  } finally {
    // Optional: don't close the client if server runs continuously
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
