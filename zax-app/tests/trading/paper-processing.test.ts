import {describe,it,expect} from "vitest";
import {verifiedPaperProcessing} from "../../server/trading/paper-processing";
describe("paper processing status (synthetic metadata only)",()=>{
  const now=1700000000000,record={origin:"scheduled",lastCompletedAt:now-1000,updatedTradeIds:["paper-1"]};
  it("requires successful publication, actual updated ID and a recent scheduled pass",()=>{
    expect(verifiedPaperProcessing(record,"paper-1",now,true).serverManaged).toBe(true);
    expect(verifiedPaperProcessing(record,"paper-1",now,false).serverManaged).toBe(false);
    expect(verifiedPaperProcessing(record,"paper-2",now,true).serverManaged).toBe(false);
    expect(verifiedPaperProcessing({...record,origin:"foreground"},"paper-1",now,true).serverManaged).toBe(false);
  });
  it("rejects future, stale and missing evidence",()=>{
    for(const value of [undefined,{...record,lastCompletedAt:now+1},{...record,lastCompletedAt:now-180001}])expect(verifiedPaperProcessing(value,"paper-1",now,true).serverManaged).toBe(false);
  });
});
