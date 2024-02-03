const PORT = process.env.PORT || 4000;
const express = require('express');
const app = express();
const bcrypt = require('bcrypt');
const admin = require('firebase-admin');
const cors= require("cors")
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const upload = multer();
var serviceAccount = require("./hackthon-fe388-firebase-adminsdk-hsaf9-948faad227.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'hackthon-fe388.appspot.com'
});

// Use express.json() and express.urlencoded() for parsing request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors())

app.post('/register', async (req, res) => {
  try {
    const { email, password,username} = req.body;
    const hashedPassword = await bcrypt.hash(password, 15);

    const userRecord = await admin.auth().createUser({
      email,
      password: hashedPassword,
      username
    });

    const userUid = userRecord.uid;

    const userData = {
      email,
      password: hashedPassword,
      username,
      activate:false
    };
    await admin.firestore().collection('users').doc(userUid).set(userData);

    res.json({ message: 'Registration successful', uid: userUid });
  } catch (error) {
    console.error('Error in registration:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// ... (other routes)



  app.post('/userdetails', async (req, res) => {
    try {
      const { uid, name, gender, age, occupation, relationshipstatus, language } = req.body;
      // Update user data in Firestore (add or update the nickname)
      await admin.firestore().collection('users').doc(uid).set(
        {
          name, gender, age, occupation, relationshipstatus, language
        },
        { merge: true } // This option ensures that existing data is not overwritten
      );
  
      res.json({ message: 'User details saved successfully', uid:uid });
    } catch (error) {
      console.error('Error in user details registration step:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  app.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;
  
      // Retrieve user by email using the admin SDK
      const userRecord = await admin.auth().getUserByEmail(email);
       console.log(userRecord)
      if (userRecord) {
        // Retrieve user data from Firestore, assuming you have a 'users' collection
        const userDocRef = admin.firestore().collection('users').doc(userRecord.uid);
        const userDoc = await userDocRef.get();
  
        if (userDoc.exists) {
          // Retrieve hashed password from Firestore
          const storedHashedPassword = userDoc.data().password;
  
          // Verify the entered password with the stored hashed password
          const isPasswordValid = await bcrypt.compare(password, storedHashedPassword);
  
          if (isPasswordValid) {
            // Generate JWT token with user UID and email
            const token = jwt.sign({ uid: userRecord.uid, email: userRecord.email }, 'your-secret-key', {
              // Add token options if needed
            });
            console.log(token)
            // Include the token in the response header and respond with user data
            res.header('Authorization', `Bearer ${token}`);
            res.json({
              message: 'Login successful',
              userData: { email: userRecord.email, uid: userRecord.uid ,token:token ,activate:userRecord.activate},
            });
          } else {
            res.status(401).json({ message: 'Invalid email or password' });
          }
        } else {
          res.status(404).json({ message: 'User not found in Firestore' });
        }
      } else {
        res.status(404).json({ message: 'User not found' });
      }
    } catch (error) {
      console.error('Error during login:', error);
  
      // Handle specific authentication errors
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        res.status(401).json({ message: 'Invalid email or password' });
      } else {
        res.status(500).json({ message: 'Internal Server Error' });
      }
    }
  });
  app.post('/activeusers', async (req, res) => {
    try {
      const { uid, dataToStore } = req.body;
  
      if (!dataToStore) {
        return res.status(400).json({ message: 'dataToStore is a required field' });
      }
  
      // Reference to the single document in the 'users' collection
      const usersCollectionRef = admin.firestore().collection('users');
  
      // Reference to the 'activeusers' subcollection
      const activeUsersDocRef = usersCollectionRef.doc('activeusers');
  
      // Get the current index
      const doc = await activeUsersDocRef.get();
      const currentIndex = doc.exists ? doc.data().index || 0 : 0;
  
      // Reference to the array within 'activeusers' subcollection
      const activeUsersArrayRef = activeUsersDocRef.collection('activeusers');
  
      // Create a new document in the 'activeusers' array with the current index
      await activeUsersArrayRef.doc(currentIndex.toString()).set({
        uid,
        dataToStore,
        index: currentIndex,
      });
  
      // Update the index for the next document
      await activeUsersDocRef.set({ index: currentIndex + 1 });
  
      // Set 'activate' to true for the user document identified by the generated UID
  
      res.json({ message: 'Data saved successfully in activeusers', index: currentIndex });
    } catch (error) {
      console.error('Error in data registration step:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  app.get('/activeusers', async (req, res) => {
    try {
      // Reference to the single document in the 'users' collection
      const usersCollectionRef = admin.firestore().collection('users');
  
      // Reference to the 'activeusers' subcollection
      const activeUsersDocRef = usersCollectionRef.doc('activeusers');
  
      // Reference to the 'activeusers' array within the subcollection
      const activeUsersArrayRef = activeUsersDocRef.collection('activeusers');
  
      // Query all documents in the 'activeusers' array
      const querySnapshot = await activeUsersArrayRef.get();
  
      // Construct an object based on the index
      const usersObject = {};
  
      // Iterate through each document in the 'activeusers' array
      for (const doc of querySnapshot.docs) {
        const userData = doc.data();
        const index = userData.index;
  
        // Retrieve user details based on UID from the 'users' collection
        const userDocRef = await usersCollectionRef.doc(userData.uid).get();
        const username = userDocRef.exists ? userDocRef.data().username : 'Unknown';
  
        usersObject[index] = {
          uid: userData.uid,
          username,
          dataToStore: userData.dataToStore,
        };
      }
  
      res.json({ activeUsers: usersObject });
    } catch (error) {
      console.error('Error in fetching active users:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  
  // app.get('/activeusers', async (req, res) => {
  //   try {
  //     // Reference to the single document in the 'users' collection
  //     const usersCollectionRef = admin.firestore().collection('users');
  
  //     // Reference to the 'activeusers' subcollection
  //     const activeUsersDocRef = usersCollectionRef.doc('activeusers');
  
  //     // Reference to the 'activeusers' array within the subcollection
  //     const activeUsersArrayRef = activeUsersDocRef.collection('activeusers');
  
  //     // Query all documents in the 'activeusers' array
  //     const querySnapshot = await activeUsersArrayRef.get();
  
  //     // Construct an object based on the index
  //     const usersObject = {};
  
  //     querySnapshot.forEach((doc) => {
  //       const userData = doc.data();
  //       const index = userData.index;
  
  //       usersObject[index] = {
  //         uid: userData.uid,

  //         dataToStore: userData.dataToStore,
  //       };
  //     });
  
  //     res.json({ activeUsers: usersObject });
  //   } catch (error) {
  //     console.error('Error in fetching active users:', error);
  //     res.status(500).json({ message: 'Internal Server Error' });
  //   }
  // });
  app.post('/create-post', upload.single('image'), async (req, res) => {
    try {
      const { uid, title, description } = req.body;
  
      let imageUrl = null;
  
      // Check if a file is provided in the request
      if (req.file) {
        // If a file is provided, process it
        const imageBuffer = req.file.buffer;
        const imageFilename = `${uuidv4()}.jpg`;
  
        // Upload the image to Firebase Storage
        const storageRef = admin.storage().bucket().file(imageFilename);
        await storageRef.save(imageBuffer, { contentType: 'image/jpeg' });
        //console.log(storageRef,storageRef.bucket.name)
        // Get the URL of the uploaded image
        imageUrl = `https://firebasestorage.googleapis.com/v0/b/${storageRef.bucket.name}/${imageFilename}`;
        console.log(imageUrl)
      }
  
      // Get the current date
      const currentDate = new Date();
  
      // Get the reference to the user's document (or create a new one if it doesn't exist)
      const userDocRef = admin.firestore().collection('userdocs').doc(uid);
      const userDoc = await userDocRef.get();
  
      // Get the current posts array or create an empty array
      const postsArray = userDoc.exists ? userDoc.data().posts || [] : [];
  
      // Store the user's post in the 'userdocs' collection with the image URL
      const postRef = await userDocRef.set({
        posts: [
          ...postsArray,
          {
            uid,
            title,
            description,
            imageUrl,
            date: currentDate,
            approved: 0,
          },
        ],
        postIndex: postsArray.length + 1,
      }, { merge: true });
  
      res.json({ message: 'Post created successfully', postId: postRef.id });
    } catch (error) {
      console.error('Error in create-post route:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  // Update the existing get-posts route to sort posts in descending order
// ... (other imports and configurations)

app.get('/get-posts/:uid', async (req, res) => {
  try {
    const uid = req.params.uid;

    // Get sorted posts for the specified user UID
    const sortedPosts = await getSortedPosts(uid);

    res.json({ posts: sortedPosts });
  } catch (error) {
    console.error('Error in get-posts route:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Function to get sorted posts for a specific user UID
async function getSortedPosts(uid) {
  // Get the reference to the user's document
  const userDocRef = admin.firestore().collection('userdocs').doc(uid);
  const userDoc = await userDocRef.get();

  // Get the posts array from the user's document
  const postsArray = userDoc.exists ? userDoc.data().posts || [] : [];

  // Sort posts in descending order based on the index
  return postsArray.sort((a, b) => b.index - a.index);
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});