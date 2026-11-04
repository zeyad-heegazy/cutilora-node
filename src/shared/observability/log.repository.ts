import { SystemLog } from './models/log.model.js';
export const logRepository = {
  create(input: Record<string, unknown>) { return SystemLog.create(input); },
  findById(id: string) { return SystemLog.findById(id).lean(); },
  async list(filter: Record<string, unknown>, page: number, limit: number) {
    const [items,total]=await Promise.all([SystemLog.find(filter).sort({occurredAt:-1}).skip((page-1)*limit).limit(limit).lean(),SystemLog.countDocuments(filter)]);
    return {items,pagination:{page,limit,total,pages:Math.ceil(total/limit)}};
  },
  async stats(from: Date,to: Date) {
    const [total,byLevel,byCategory,timeline]=await Promise.all([
      SystemLog.countDocuments({occurredAt:{$gte:from,$lte:to}}),
      SystemLog.aggregate([{$match:{occurredAt:{$gte:from,$lte:to}}},{$group:{_id:'$level',count:{$sum:1}}}]),
      SystemLog.aggregate([{$match:{occurredAt:{$gte:from,$lte:to}}},{$group:{_id:'$category',count:{$sum:1}}}]),
      SystemLog.aggregate([{$match:{occurredAt:{$gte:from,$lte:to}}},{$group:{_id:{$dateToString:{format:'%Y-%m-%d',date:'$occurredAt'}},count:{$sum:1},errors:{$sum:{$cond:[{$in:['$level',['error','fatal']]},1,0]}}}},{$sort:{_id:1}}])
    ]);
    return {total,byLevel,byCategory,timeline};
  },
};