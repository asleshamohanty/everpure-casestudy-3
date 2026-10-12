const report = {
    id: "RPT 200",
    views: 146,
    credits: 857.88,
    awsUsd: 75.51,
};

const priceperCredit = 3;
const costperview = (report.credits * priceperCredit + report.awsUsd) / report.views;
console.log(report.id, "cost $" + costperview.toFixed(2) + " per view");