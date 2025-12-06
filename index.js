const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

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

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB successfully!");

    const db = client.db("assignment-11");
    const usersCollection = db.collection("users");
    const servicesCollection = db.collection("services");

    // Create user
    // Create user
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        const email = user.email;

        const userExists = await usersCollection.findOne({ email });
        if (userExists) {
          return res.status(400).json({ message: "User already exists" });
        }

        // Add default status if role is decorator
        if (user.role === "decorator") {
          user.status = "pending"; // default status
        }

        user.createdAt = new Date();
        const result = await usersCollection.insertOne(user);
        res.status(201).json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get all users (with optional role filter)
    app.get("/users", async (req, res) => {
      try {
        const role = req.query.role;
        const filter = role ? { role } : {};
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
      res.send("Added");
    });

    app.get("/services", async (req, res) => {
      const cursor = await servicesCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();
      res.send(cursor);
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

    console.log("API endpoints are ready");
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
