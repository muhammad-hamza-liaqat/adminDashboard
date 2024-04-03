import StatusCodes from "http-status-codes";
import { MongoClient } from "mongodb";
import { ObjectId } from "mongodb";
import { DBConn } from "./utils/helper.mjs";

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
        } else if (path === "/adminAnalytics"){
          return await adminAnalytics(queryParams)
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
  const client = await DBConn();
  const db = client.db("10D");
  try {
    const searchField = queryParams.searchField;
    const page = Number(queryParams.page) || 1;
    const limit = Number(queryParams.limit) || 10;
    const skip = (page - 1) * limit;

    const chainNames = await db.collection("chains").distinct("name");

    if (!chainNames.length) {
      return {
        statusCode: StatusCodes.NOT_FOUND,
        body: JSON.stringify({ message: "Chains not found" }),
      };
    }

    const pipeline = chainNames.flatMap((chainName) => [
      {
        $unionWith: { coll: "treeNodes" + chainName },
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userData",
        },
      },
      {
        $unwind: "$userData",
      },
      {
        $match: {
          $or: [
            { "userData.userName": { $regex: new RegExp(searchField, "i") } },
            { nodeId: parseInt(searchField) },
            { totalEarning: { $eq: parseInt(searchField) } },
            { totalMembers: { $eq: parseInt(searchField) } },
          ],
        },
      },
      { $skip: skip },
      { $limit: limit },
    ]);

    const nodes = await db
      .collection(chainNames[0])
      .aggregate(pipeline)
      .toArray();

    await client.close();

    if (!nodes.length) {
      return {
        statusCode: StatusCodes.NOT_FOUND,
        body: JSON.stringify({ message: "Nodes not found" }),
      };
    }

    return {
      statusCode: StatusCodes.OK,
      body: JSON.stringify({ message: "Nodes fetched successfully", nodes }),
    };
  } catch (error) {
    console.error("An error occurred:", error);
    return {
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      body: JSON.stringify({
        message: "Something went wrong",
        error: error.message,
      }),
    };
  }
};

const adminAnalytics = async (queryParams) => {
  const client = await DBConn();
  const db = client.db("10D");
  try {

    const chains = await db.collection("chains").find({}).toArray();
    let totalChainInvestment = 0;
    let totalNodesCount = 0;
    const totalChainsCount = await db.collection("chains").countDocuments();

    for (const chain of chains) {
      const collectionName = `treeNodes${chain.name}`;
      const rootNode = await db.collection(collectionName).findOne(
        { _id: chain?.rootNode },
        {
          projection: { totalMembers: 1 },
        }
      );
      if (rootNode) {
        const chainInvestment = rootNode.totalMembers * chain.seedAmount;
        totalChainInvestment += chainInvestment;
        totalNodesCount += rootNode.totalMembers;
      }
    }

    client.close();

    return {
      statusCode: StatusCodes.OK,
      body: JSON.stringify({
        message: "Success",
        totalChainInvestment: totalChainInvestment,
        totalChains: totalChainsCount,
        totalNodes: totalNodesCount,
      }),
    };
  } catch (error) {
    console.error("An error occured:", error);
    return {
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      body: JSON.stringify({
        message: "somthing went wrong",
        error: error.message,
      }),
    };
  }
};
