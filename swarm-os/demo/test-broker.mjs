import { createBroker } from 'aedes';
async function test() {
    try {
        const broker = await createBroker();
        console.log("SUCCESS");
    } catch (e) {
        console.error("FAIL", e);
    }
}
test();
