import StatusCodes from "http-status-codes";
import { MongoClient } from "mongodb";
import { ObjectId } from "mongodb";

import {
  HTTPError,
  HTTPResponse,
  DBConn,
  catchError,
} from "./utils/helper.mjs";

export const lambdaHandler = async (event) => {
  try {
    const method = event.httpMethod;
    const path = event.path;
    const pathParams = event.pathParameters;
    const body = event.body;
    const queryParams = event.queryStringParameters || {};

    switch (method) {
      case "GET":
        if (path === "/getAllUser") {
          return await getAllUser(queryParams);
        } else if (path === "/getUserChainStats") {
          return await getUserChainStats(queryParams);
        } else if (path === "/searchUser") {
          return await searchUsers(queryParams);
        }
      case "PATCH":
        if (path.startsWith("/softDelete/") && pathParams && pathParams.id) {
          return await softDelete(pathParams.id, body);
        } else if (
          path.startsWith("/updateStatus/") &&
          pathParams &&
          pathParams.id &&
          pathParams.status
        ) {
          return await updateUserStatus(pathParams.id, pathParams.status);
        }
      default:
        return {
          statusCode: StatusCodes.METHOD_NOT_ALLOWED,
          body: JSON.stringify({
            message: "Endpoint not allowed",
          }),
        };
    }
  } catch (error) {
    console.error("An error occurred:", error);
    return {
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      body: JSON.stringify({ message: "Something Went Wrong", error: error }),
    };
  }
};

const getAllUser = async (queryParams) => {
  try {
    const client = await DBConn();
    const db = client.db("10D");
    const usersCollection = db.collection("users");
    const totalUsersCount = await usersCollection.countDocuments();

    const page = Number(queryParams.page) || 1;
    const limit = Number(queryParams.limit) || 10;
    const skip = (page - 1) * limit;

    const users = await usersCollection
      .find({})
      .skip(skip)
      .limit(limit)
      .toArray();

    const userArr = users.map((user) => ({
      userId: user._id,
      userName: user.userName,
      totalNodes: user.totalNode,
      outReach: user.outReach || 0,
      userBalance: user.userWallet ? user.userWallet.userBalance : 0,
    }));

    await client.close();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Success",
        users: userArr,
        totalUsers: totalUsersCount,
      }),
    };
  } catch (error) {
    console.error("An error occurred:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Something Went Wrong",
        error: error.message,
      }),
    };
  }
};

const getUserChainStats = async (queryParams) => {
  try {
    const client = await DBConn();
    const db = client.db("10D");
    const totalUsers = await db.collection("users").countDocuments({});
    let totalChainInvestment = 0;
    const chains = await db.collection("chains").find({}).toArray();

    for (const chain of chains) {
      const collectionName = `treeNodes${chain.name}`;
      const rootNode = await db
        .collection(collectionName)
        .findOne({ _id: chain?.rootNode }, { projection: { totalMembers: 1 } });
      const chainInvestment = rootNode.totalMembers * chain.seedAmount;
      totalChainInvestment += chainInvestment;
    }

    await client.close();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Success",
        totalUsers,
        totalChainInvestment,
      }),
    };
  } catch (error) {
    console.log("an error has occured", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "something went wrong!, try again later",
        error: error.message,
      }),
    };
  }
};

const softDelete = async (userId) => {
  try {
    // console.log("Received userId:", userId);
    const userIdObjectId = new ObjectId(userId);
    // console.log("Converted userId to ObjectId:", userIdObjectId);

    const client = await DBConn();
    const db = client.db("10D");
    const userToFind = await db
      .collection("users")
      .findOne({ _id: userIdObjectId });
    // console.log("User found:", userToFind);

    if (!userToFind) {
      console.log("User not found");
      return {
        statusCode: StatusCodes.NOT_FOUND,
        body: JSON.stringify({
          message: "User not found against this userID",
        }),
      };
    }

    // Perform soft deleting
    userToFind.isDeleted = true;
    await db
      .collection("users")
      .updateOne({ _id: userIdObjectId }, { $set: { isDeleted: true } });
    console.log("User soft-deleted successfully");
    await client.close();

    return {
      statusCode: StatusCodes.OK,
      body: JSON.stringify({
        message: "User soft-deleting action performed successfully!",
      }),
    };
  } catch (error) {
    console.error("An error occurred:", error);
    return {
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      body: JSON.stringify({
        message: "Something went wrong!",
      }),
    };
  }
};

const updateUserStatus = async (userId, userStatus) => {
  // console.log("received userID", userId);
  // console.log("received userStatus", userStatus);

  try {
    const userIdObjectId = new ObjectId(userId);
    const client = await DBConn();
    const db = client.db("10D");
    const userToUpdate = await db
      .collection("users")
      .findOne({ _id: userIdObjectId });
    if (!userToUpdate) {
      return {
        statusCode: StatusCodes.NOT_FOUND,
        body: JSON.stringify({
          message: " user not found against this _id",
        }),
      };
    }
    // update the status
    userToUpdate.status = userStatus;
    await db
      .collection("users")
      .updateOne({ _id: userIdObjectId }, { $set: { status: userStatus } });

    await client.close();
    return {
      statusCode: StatusCodes.OK,
      body: JSON.stringify({
        message: `user with ${userId}'s status has been updated`,
      }),
    };
  } catch (error) {
    console.log("an error occured", error);
    return {
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      body: JSON.stringify({
        message: "something went wrong!",
      }),
    };
  }
};

const searchUsers = async (queryParams) => {
  const client = await DBConn();
  const db = client.db("10D");
  try {
    const page = Number(queryParams.page) || 1;
    const limit = Number(queryParams.limit) || 10;
    const search = queryParams.search;
    const skip = (page - 1) * limit;
    // debugging
    console.log("received page", page);
    console.log("received limit", limit); 
    console.log("received search", search); 
    const pipeline = [
      {
        $lookup: {
          from: "userwallets",
          localField: "userWallet",
          foreignField: "_id",
          as: "userWallet",
        },
      },
      { $unwind: "$userWallet" },
      {
        $match: {
          $or: [
            { firstName: { $regex: new RegExp(search, "i") } },
            { lastName: { $regex: new RegExp(search, "i") } },
            { email: { $regex: new RegExp(search, "i") } },
            { userName: { $regex: new RegExp(search, "i") } },
            { totalNode: { $regex: new RegExp(search, "i") } },
            { "userWallet.userBalance": { $eq: parseInt(search) } },
          ],
        },
      },
      { $skip: skip },
      { $limit: limit },
    ];

    const users = await db.collection("users").aggregate(pipeline).toArray(); 
    const totalUsers = await db.collection("users").countDocuments();
    console.log("users=>", users); // debugging
    return {
      statusCode: StatusCodes.OK,
      body: JSON.stringify({
        message: "Success",
        users,
        totalUsers,
      }),
    };
  } catch (error) {
    console.error("An error occurred:", error);
    return {
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      body: JSON.stringify({
        message: "Something went wrong!",
        error: error.message,
      }),
    };
  }
};

