const express = require('express')
const app = express()
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')

app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

const convertDbUserObjectToResponseObject = dbObject => {
  return {
    userId: dbObject.user_id,
    name: dbObject.name,
    username: dbObject.username,
    password: dbObject.password,
    gender: dbObject.gender,
  }
}

const convertDbFollowerObjectToResponseObject = dbObject => {
  return {
    followerId: dbObject.follower_id,
    followerUserId: dbObject.follower_user_id,
    followingUserId: dbObject.following_user_id,
  }
}

const convertDbTweetObjectToResponseObject = dbObject => {
  return {
    tweetId: dbObject.tweet_id,
    tweet: dbObject.tweet,
    userId: dbObject.user_id,
    dateTime: dbObject.date_time,
  }
}

const convertDbReplyObjectToResponseObject = dbObject => {
  return {
    replyId: dbObject.reply_id,
    tweetId: dbObject.tweet_id,
    reply: dbObject.reply,
    userId: dbObject.user_id,
    dateTime: dbObject.date_time,
  }
}

const convertDbLikeObjectToResponseObject = dbObject => {
  return {
    likeId: dbObject.like_id,
    tweetId: dbObject.tweet_id,
    userId: dbObject.user_id,
    dateTime: dbObject.date_time,
  }
}

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

app.post('/register', async (request, response) => {
  const {username, password, name, gender} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else if (password.length < 6) {
    response.status(400)
    response.send('Password is too short')
  } else {
    const hashedPassword = await bcrypt.hash(password, 10)
    const createUserQuery = `
      INSERT INTO 
        user (username, password, name, gender) 
      VALUES 
        (
          '${username}', 
          '${hashedPassword}',
          '${name}', 
          '${gender}'
        )`
    await db.run(createUserQuery)
    response.send('User created successfully')
  }
})

app.post('/login', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}'`
  const dbUser = await db.get(getUserIdQuery)
  const userId = dbUser.user_id

  const getTweetFeedsQuery = `
    SELECT 
      user.username, tweet.tweet, tweet.date_time AS dateTime
    FROM 
      follower 
      INNER JOIN tweet ON follower.following_user_id = tweet.user_id 
      INNER JOIN user ON tweet.user_id = user.user_id
    WHERE 
      follower.follower_user_id = ${userId}
    ORDER BY 
      tweet.date_time DESC 
    LIMIT 4;
  `
  const tweetsArray = await db.all(getTweetFeedsQuery)
  response.send(
    tweetsArray.map(tweet => ({
      username: tweet.username,
      tweet: tweet.tweet,
      dateTime: tweet.dateTime,
    })),
  )
})

app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}'`
  const dbUser = await db.get(getUserIdQuery)
  const userId = dbUser.user_id

  const getFollowingQuery = `
    SELECT 
      user.name 
    FROM 
      follower 
      INNER JOIN user ON follower.following_user_id = user.user_id 
    WHERE 
      follower.follower_user_id = ${userId};
  `
  const followingArray = await db.all(getFollowingQuery)
  response.send(followingArray.map(follow => ({name: follow.name})))
})

app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}'`
  const dbUser = await db.get(getUserIdQuery)
  const userId = dbUser.user_id

  const getFollowersQuery = `
    SELECT 
      user.name 
    FROM 
      follower 
      INNER JOIN user ON follower.follower_user_id = user.user_id 
    WHERE 
      follower.following_user_id = ${userId};
  `
  const followersArray = await db.all(getFollowersQuery)
  response.send(followersArray.map(follow => ({name: follow.name})))
})

app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {tweetId} = request.params
  const {username} = request

  const isFollowingQuery = `
    SELECT 
      * 
    FROM 
      tweet 
      INNER JOIN follower ON tweet.user_id = follower.following_user_id 
    WHERE 
      tweet.tweet_id = ${tweetId} 
      AND follower.follower_user_id = (SELECT user_id FROM user WHERE username = '${username}');
  `
  const isFollowing = await db.get(isFollowingQuery)

  if (isFollowing === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const getTweetQuery = `
      SELECT 
        tweet.tweet,
        (SELECT COUNT(*) FROM like WHERE like.tweet_id = tweet.tweet_id) AS likes,
        (SELECT COUNT(*) FROM reply WHERE reply.tweet_id = tweet.tweet_id) AS replies,
        tweet.date_time AS dateTime
      FROM 
        tweet
      WHERE 
        tweet.tweet_id = ${tweetId};
    `
    const tweet = await db.get(getTweetQuery)
    response.send(tweet)
  }
})

app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request

    const isFollowingQuery = `
    SELECT 
      * 
    FROM 
      tweet 
      INNER JOIN follower ON tweet.user_id = follower.following_user_id 
    WHERE 
      tweet.tweet_id = ${tweetId} 
      AND follower.follower_user_id = (SELECT user_id FROM user WHERE username = '${username}');
  `
    const isFollowing = await db.get(isFollowingQuery)

    if (isFollowing === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const getLikesQuery = `
      SELECT 
        user.username 
      FROM 
        like 
        INNER JOIN user ON like.user_id = user.user_id 
      WHERE 
        like.tweet_id = ${tweetId};
    `
      const likesArray = await db.all(getLikesQuery)
      response.send({likes: likesArray.map(like => like.username)})
    }
  },
)

app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request

    const isFollowingQuery = `
    SELECT 
      * 
    FROM 
      tweet 
      INNER JOIN follower ON tweet.user_id = follower.following_user_id 
    WHERE 
      tweet.tweet_id = ${tweetId} 
      AND follower.follower_user_id = (SELECT user_id FROM user WHERE username = '${username}');
  `
    const isFollowing = await db.get(isFollowingQuery)

    if (isFollowing === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const getRepliesQuery = `
      SELECT 
        user.name, reply.reply 
      FROM 
        reply 
        INNER JOIN user ON reply.user_id = user.user_id 
      WHERE 
        reply.tweet_id = ${tweetId};
    `
      const repliesArray = await db.all(getRepliesQuery)
      response.send({
        replies: repliesArray.map(reply => ({
          name: reply.name,
          reply: reply.reply,
        })),
      })
    }
  },
)

app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserTweetsQuery = `
    SELECT 
      tweet.tweet,
      (SELECT COUNT(*) FROM like WHERE like.tweet_id = tweet.tweet_id) AS likes,
      (SELECT COUNT(*) FROM reply WHERE reply.tweet_id = tweet.tweet_id) AS replies,
      tweet.date_time AS dateTime
    FROM 
      tweet 
    WHERE 
      tweet.user_id = (SELECT user_id FROM user WHERE username = '${username}');
  `
  const userTweets = await db.all(getUserTweetsQuery)
  response.send(userTweets)
})

app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const {tweet} = request.body
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`
  const dbUser = await db.get(getUserIdQuery)
  const userId = dbUser.user_id
  const createTweetQuery = `
    INSERT INTO tweet (tweet, user_id, date_time)
    VALUES ('${tweet}', ${userId}, DATETIME('now'));
  `
  await db.run(createTweetQuery)
  response.send('Created a Tweet')
})

app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`
    const dbUser = await db.get(getUserIdQuery)
    const userId = dbUser.user_id

    const getTweetQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId} AND user_id = ${userId};`
    const tweet = await db.get(getTweetQuery)

    if (tweet === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`
      await db.run(deleteTweetQuery)
      response.send('Tweet Removed')
    }
  },
)

module.exports = app
