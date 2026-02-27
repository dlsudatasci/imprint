
import React from "react";
import { H3 } from "@/ui/Typography";
import { P } from "@/ui/Typography";
import Tooltip from "ui/tooltip";
import ActivityItem from "./activityItem";

export default class DashboardInfo extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      userActivity: [],
      lastAnnotation: 0,
      totalAnnotation: 0,
      username: this.props.username,
    };
  }

  componentDidMount() {
    this.fetchData();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.refreshCounter !== this.props.refreshCounter || prevProps.username !== this.props.username) {
      this.setState({ username: this.props.username }, () => {
        this.fetchData();
      });
    }
  }

  async fetchData() {
    if (!this.state.username) return;
    const extractUser = await fetch("/api/extractUser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.state.username),
    }).then((result) => result.json());

    this.setState({
      userActivity: extractUser.userActivities,
      lastAnnotation: extractUser.lastAnnotationDate,
      totalAnnotation: extractUser.annotationCount,
    });
  }

  render() {
    return (
      <section className="mt-4 pb-12 bg-gray-100">
        <hr />

        <div className="flex flex-col mx-auto md:flex-row container lg:max-w-7xl lg:w-4/5 ">
          <div className="mx-auto sm:mx-0 md:w-2/5">
            <div className="bg-white w-96 p-5 shadow-2xl border rounded-md -mt-16">
              <H3 className="mb-4">Your profile</H3>
              <P>
                <Tooltip>Total number of annotations you made</Tooltip>
                <span className="font-bold">Total annotations: </span>{" "}
                {this.state.totalAnnotation}
              </P>
              <P>
                <Tooltip>Last time you annotated</Tooltip>
                <span className="font-bold">Latest Annotation: </span>{" "}
                {this.state.lastAnnotation}
              </P>
            </div>
          </div>

          {/* CHANGED: Added 'flex flex-col' so we can control the list height */}
          <div className="mt-10 md:-mt-12 px-5 h-96 flex flex-col">
            <H3>Recent Activity</H3>

            {/* CHANGED: Added 'flex-1' (fills space) and 'overflow-y-auto' (scrolls) */}
            <ul className="mt-5 flex-1 overflow-y-auto pr-2">
              {this.state.userActivity.length > 0 ? (
                this.state.userActivity
                  .slice(0) // 1. Make a copy
                  .reverse() // 2. Reverse the copy
                  .map((activity, index) => {
                    return <ActivityItem activity={activity} key={index} />;
                  })
              ) : (
                <P>No recent activity found.</P>
              )}
            </ul>
          </div>
        </div>
      </section>
    );
  }
}
