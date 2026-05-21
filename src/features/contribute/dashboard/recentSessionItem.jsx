import React from "react";
import Link from "next/link";

export default function RecentSessionItem({ sessionData }) {
  const { isActive, currentCount, date, location, totalImages, imageUrls, chartData = [], averageScore } = sessionData;

  const handleStopSession = async () => {
    try {
      await fetch("/api/annotationAbandon", { method: "POST" });
      localStorage.removeItem("annotationCurrentCount");
      localStorage.removeItem("annotationTotalCount");
      localStorage.removeItem("annotationSetData");
      window.location.reload();
    } catch (e) {
      console.error(e);
    }
  };

  const jsDate = new Date(date);
  const options = {
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  const stringDate = jsDate.toLocaleDateString("en-US", options);

  // Score Color Logic based on theme (Primary: #004aad, Gold for high)
  const numericScore = parseFloat(averageScore);
  let scoreBg = "bg-gray-200 text-gray-700";
  if (numericScore >= 8) {
    scoreBg = "bg-primary text-white"; // High
  } else if (numericScore >= 5) {
    scoreBg = "bg-blue-300 text-blue-900"; // Mid
  } else if (numericScore > 0) {
    scoreBg = "bg-gray-300 text-gray-800"; // Low
  }

  // Calculate max annotations for the bar chart scaling
  const maxAnnotations = Math.max(...chartData, 1); // Avoid div by zero

  return (
    <li className="border-b border-gray-100 py-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-transparent">

      {/* Left: Date, Location, and Images */}
      <div className="flex flex-col gap-3 flex-1">
        <div>
          <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider">
            {stringDate} • {location}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {imageUrls.map((url, idx) => (
            <div key={idx} className="w-14 h-14 relative rounded-lg overflow-hidden border border-gray-200 shadow-sm bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {url ? (
                <img src={url} alt={`Annotation ${idx}`} className="object-cover w-full h-full" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">IMG</div>
              )}
            </div>
          ))}
          {totalImages > 3 && (
            <div className="w-14 h-14 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center font-bold text-gray-600 shadow-sm">
              +{totalImages - 3}
            </div>
          )}
        </div>
      </div>

      {/* Right: Chart and Score OR Active Session Buttons */}
      <div className="flex items-center justify-end gap-8 w-full md:w-auto mt-4 md:mt-0">

        {isActive ? (
          <div className="flex flex-row space-x-3 w-full justify-end">
            <button
              onClick={handleStopSession}
              className="transition-all duration-500 ease-in-out font-semibold py-3 px-8 text-sm rounded-[2rem] border hover:-translate-y-0.5 hover:shadow-md border-gray-200 text-accent hover:border-accent bg-white whitespace-nowrap"
            >
              Stop Session
            </button>
            <Link
              href="/contribute/annotate"
              className="transition-all duration-500 ease-in-out font-semibold py-3 px-8 text-sm rounded-[2rem] border hover:-translate-y-0.5 hover:shadow-md bg-primary border-primary text-white hover:bg-opacity-90 flex items-center whitespace-nowrap"
            >
              Resume Session ({Math.max(0, currentCount - 1)}/{totalImages})
            </Link>
          </div>
        ) : (
          <>
            {/* Bar Chart */}
            <div className="flex flex-col items-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Obstruction Density</p>
              <div className="flex items-end gap-1 h-10 border-b border-gray-100 pb-px">
                {chartData.map((val, idx) => {
                  const heightPercent = Math.max((val / maxAnnotations) * 100, 5); // min 5% height for visibility
                  return (
                    <div key={idx} className="w-3 relative group flex items-end h-full">
                      <div
                        className="w-full bg-blue-400 rounded-t-sm group-hover:bg-blue-600 transition-all duration-300"
                        style={{ height: `${heightPercent}%` }}
                      ></div>
                      {/* Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded pointer-events-none transition-opacity z-10">
                        {val}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Average Score */}
            <div className="flex flex-col items-center justify-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Avg Score</p>
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-black shadow-inner border border-black/5 ${scoreBg}`}>
                {numericScore > 0 ? numericScore : "-"}
              </div>
            </div>
          </>
        )}
      </div>

    </li>
  );
}
