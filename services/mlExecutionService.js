const path = require("path");
const jiti = require("jiti")(__filename, { interopDefault: true });

const {
  createRemoteRef,
  getRemoteObject,
} = require("./mlRemoteObjectStore");

const SERVICE_MODULES = {
  mlService: path.resolve(__dirname, "./ml/mlService.js"),
  randomForestService: path.resolve(__dirname, "./ml/randomForestService.js"),
  longTermRandomForestService: path.resolve(__dirname, "./ml/longTermRandomForestService.js"),
  longTermNaiveBayesService: path.resolve(__dirname, "./ml/longTermNaiveBayesService.js"),
  ensembleService: path.resolve(__dirname, "./ml/ensembleService.js"),
  longTermEnsembleService: path.resolve(__dirname, "./ml/longTermEnsembleService.js"),
  longTermLSTMService: path.resolve(__dirname, "./ml/longTermLSTMService.js"),
  linearRegressionService: path.resolve(__dirname, "./ml/linearRegressionService.js"),
  institutionalLinearRegressionService: path.resolve(__dirname, "./ml/institutionalLinearRegressionService.js"),
  xgBoostStockService: path.resolve(__dirname, "./ml/xgBoostStockService.js"),
  lstmModel: path.resolve(__dirname, "./ml/lstmModel.js"),
  technicalIndicators: path.resolve(__dirname, "./ml/technicalIndicators.js"),
};

const moduleCache = new Map();

const isPrimitive = (value) =>
  value === null ||
  value === undefined ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

const isPlainObject = (value) => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const deserializeValue = (value) => {
  if (isPrimitive(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(deserializeValue);
  }

  if (value && typeof value === "object" && value.__remoteRef) {
    const referencedObject = getRemoteObject(value.__remoteRef);
    if (!referencedObject) {
      throw new Error(`Remote reference not found: ${value.__remoteRef}`);
    }
    return referencedObject;
  }

  if (isPlainObject(value)) {
    const output = {};
    Object.entries(value).forEach(([key, item]) => {
      output[key] = deserializeValue(item);
    });
    return output;
  }

  return value;
};

const buildSnapshot = (value) => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const snapshot = {};
  Object.entries(value).forEach(([key, item]) => {
    if (isPrimitive(item)) {
      snapshot[key] = item;
    }
  });
  return snapshot;
};

const serializeValue = (value) => {
  if (isPrimitive(value)) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (isPlainObject(value)) {
    const output = {};
    Object.entries(value).forEach(([key, item]) => {
      if (typeof item === "function") {
        return;
      }
      output[key] = serializeValue(item);
    });
    return output;
  }

  return createRemoteRef(value, value?.constructor?.name, buildSnapshot(value));
};

const getModule = (service) => {
  if (!SERVICE_MODULES[service]) {
    throw new Error(`Unsupported ML service: ${service}`);
  }

  if (!moduleCache.has(service)) {
    moduleCache.set(service, jiti(SERVICE_MODULES[service]));
  }

  return moduleCache.get(service);
};

const invokeRemoteMethod = async (targetRef, methodName, methodArgs = []) => {
  const target = getRemoteObject(targetRef?.__remoteRef || targetRef);
  if (!target) {
    throw new Error("Remote object not found for method invocation");
  }

  if (typeof target[methodName] !== "function") {
    throw new Error(`Method ${methodName} does not exist on remote object`);
  }

  const deserializedArgs = deserializeValue(methodArgs);
  const output = await target[methodName](...deserializedArgs);
  return serializeValue(output);
};

const executeMlMethod = async ({ service, method, args = [] }) => {
  if (service === "__remote__" && method === "invoke") {
    const [targetRef, methodName, methodArgs = []] = args;
    return invokeRemoteMethod(targetRef, methodName, methodArgs);
  }

  const serviceModule = getModule(service);
  const targetMethod = serviceModule[method];

  if (typeof targetMethod !== "function") {
    throw new Error(`Method ${method} is not available in ${service}`);
  }

  const deserializedArgs = deserializeValue(args);
  const rawResult = await targetMethod(...deserializedArgs);
  return serializeValue(rawResult);
};

module.exports = {
  executeMlMethod,
};