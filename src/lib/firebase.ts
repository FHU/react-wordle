import { getAnalytics } from 'firebase/analytics'
import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore'

import { GameStats, LeaderboardUser } from './../constants/types'
import { defaultStats } from './stats'

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
}

const app = initializeApp(firebaseConfig)
getAnalytics(app)

export const auth = getAuth(app)
export const db = getFirestore(app)
const googleProvider = new GoogleAuthProvider()

export const signInWithGoogle = async (): Promise<void> => {
  try {
    signInWithPopup(auth, googleProvider)
      .then(async (res) => {
        await addUserToFirestoreCollection(
          res.user,
          res.user.displayName,
          'google'
        )
      })
      .catch((error) => {
        console.log(error)
      })
  } catch (err) {
    console.error(err)
  }
}

export const createAccountWithUsernameAndPassword = async (
  username: string,
  email: string,
  password: string
): Promise<void> => {
  try {
    const res = await createUserWithEmailAndPassword(auth, email, password)
    await addUserToFirestoreCollection(res.user, username, 'password')
  } catch (err) {
    console.error(err)
  }
}

const getUserDocByUid = async (userId: string): Promise<any> => {
  const docRef = doc(db, 'users', userId)
  return await getDoc(docRef)
}

export const getUserDataByUid = async (userId: string): Promise<any> => {
  const user = await getUserDocByUid(userId)
  if (!user.exists) {
    return null
  }

  return user.data()
}

const addUserToFirestoreCollection = async (
  u: User,
  username: string | null,
  provider: string
): Promise<void> => {
  const user = await getUserDocByUid(u.uid)
  if (!user.exists()) {
    await setDoc(doc(db, 'users', u.uid), {
      uid: u.uid,
      name: username,
      email: u.email,
      authProvider: provider,
      photoURL: u.photoURL ?? '',
      lastUpdated: Timestamp.now(),
      lastSolution: '',
      stats: {
        avgNumGuesses: defaultStats.avgNumGuesses,
        bestStreak: defaultStats.bestStreak,
        currentStreak: defaultStats.currentStreak,
        gamesFailed: defaultStats.gamesFailed,
        score: defaultStats.score,
        successRate: defaultStats.successRate,
        totalGames: defaultStats.totalGames,
        winDistribution: defaultStats.winDistribution,
      },
    })
  }
}

export const resetForgottenPassword = async (
  email: string
): Promise<boolean> => {
  await sendPasswordResetEmail(auth, email)
    .then(() => {
      return true
    })
    .catch((error) => {
      console.log(error)
    })

  return false
}

export const logout = () => {
  signOut(auth)
}

export const loadStatsFromFirestoreCollection = async (
  userId: string
): Promise<GameStats | null> => {
  const userDoc = await getUserDocByUid(userId)
  if (!userDoc.exists()) {
    return null
  }

  const stats: GameStats = {
    avgNumGuesses: userDoc.data().stats.avgNumGuesses,
    bestStreak: userDoc.data().stats.bestStreak,
    currentStreak: userDoc.data().stats.currentStreak,
    gamesFailed: userDoc.data().stats.gamesFailed,
    score: userDoc.data().stats.score,
    successRate: userDoc.data().stats.successRate,
    totalGames: userDoc.data().stats.totalGames,
    winDistribution: userDoc.data().stats.winDistribution,
  }

  return stats
}

export const saveStatsToFirestoreCollection = async (
  userId: string,
  stats: GameStats,
  solution: string
): Promise<void> => {
  const userDoc = await getUserDocByUid(userId)

  if (userDoc.exists()) {
    const docRef = doc(db, 'users', userId)

    if (userDoc.data().stats.totalGames >= stats.totalGames) {
      return
    }

    await updateDoc(docRef, {
      lastUpdated: Timestamp.now(),
      lastSolution: solution,
      stats: {
        avgNumGuesses: stats.avgNumGuesses,
        bestStreak: stats.bestStreak,
        currentStreak: stats.currentStreak,
        gamesFailed: stats.gamesFailed,
        score: stats.score,
        successRate: stats.successRate,
        totalGames: stats.totalGames,
        winDistribution: stats.winDistribution,
      },
    })
  }
}

// TODO: use last updated to determine if game has been played today

export const getLeaderBoardFromFirestore = async (
  userId?: string
): Promise<LeaderboardUser[]> => {
  let leaderBoard: LeaderboardUser[] = []

  // TODO: probably want to add limits to the number returned in the future -- will impact how rank is calculated currently
  const q = query(collection(db, 'users'), orderBy('stats.score', 'desc'))
  const querySnapshot = await getDocs(q)

  let rank = 1
  querySnapshot.forEach((doc) => {
    leaderBoard.push({
      uid: doc.data().uid,
      rank: rank,
      name: doc.data().name,
      avgGuesses: doc.data().stats.avgNumGuesses,
      points: doc.data().stats.score,
      stats: {
        currentStreak: doc.data().stats.currentStreak,
        bestStreak: doc.data().stats.bestStreak,
        successRate: doc.data().stats.successRate,
      },
      highlightedUser: doc.data().uid === userId,
    })

    rank++
  })

  return leaderBoard
}
