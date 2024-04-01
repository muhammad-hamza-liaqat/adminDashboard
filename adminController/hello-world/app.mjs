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
        if (path === "/searchNodes") {
          return await searchNodes(queryParams);
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

const searchNodes = async (queryParams) => {
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

