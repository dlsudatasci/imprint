export default function ActivityItem({ activity }) {
  const jsDate = new Date(activity.date);
  const options = {
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  const stringDate = jsDate.toLocaleDateString("en-US", options);

  return (
    <li className="border-b flex flex-row justify-between py-2 w-full gap-4">
      <p className="font-semibold">{activity.activity}</p>
      <p className="italic text-right whitespace-nowrap">{stringDate}</p>
    </li>
  );
}
