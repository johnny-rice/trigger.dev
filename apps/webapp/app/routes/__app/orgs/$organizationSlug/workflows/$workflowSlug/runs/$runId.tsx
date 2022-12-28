import {
  DocumentTextIcon,
  ArrowPathRoundedSquareIcon,
  BeakerIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/solid";
import {
  ArrowRightIcon,
  BarsArrowDownIcon,
  BoltIcon,
  CalendarDaysIcon,
  ChatBubbleLeftEllipsisIcon,
} from "@heroicons/react/24/outline";
import { Panel } from "~/components/layout/Panel";
import { PrimaryButton } from "~/components/primitives/Buttons";
import { Body } from "~/components/primitives/text/Body";
import {
  Header1,
  Header2,
  Header3,
  Header4,
} from "~/components/primitives/text/Headers";
import CodeBlock from "~/components/code/CodeBlock";
import type { ReactNode } from "react";
import { dateDifference, formatDateTime } from "~/utils";
import type { LoaderArgs } from "@remix-run/server-runtime";
import { typedjson, useTypedLoaderData } from "remix-typedjson";
import { requireUserId } from "~/services/session.server";
import invariant from "tiny-invariant";
import { WorkflowRunPresenter } from "~/models/workflowRunPresenter.server";
import type { WorkflowRunStatus } from "~/models/workflowRun.server";
import humanizeDuration from "humanize-duration";
import classNames from "classnames";
import { runStatusIcon, runStatusLabel } from "~/components/runs/runStatus";

export const loader = async ({ request, params }: LoaderArgs) => {
  await requireUserId(request);
  const { runId } = params;
  invariant(runId, "runId is required");

  const presenter = new WorkflowRunPresenter();

  try {
    const run = await presenter.data(runId);
    return typedjson({ run });
  } catch (error: any) {
    console.error(error);
    throw new Response("Error ", { status: 404 });
  }
};

type Run = Awaited<ReturnType<WorkflowRunPresenter["data"]>>;
type Trigger = Run["trigger"];
type Step = Run["steps"][number];
type TriggerType<T, K extends Trigger["type"]> = T extends { type: K }
  ? T
  : never;
type StepType<T, K extends Step["type"]> = T extends { type: K } ? T : never;

export default function Page() {
  const { run } = useTypedLoaderData<typeof loader>();
  const output = run.steps.find((s) => s.type === "OUTPUT") as
    | StepType<Step, "OUTPUT">
    | undefined;

  return (
    <>
      <div className="flex sticky -top-12 py-4 -mt-4 -ml-1 pl-1 bg-slate-850 justify-between items-center z-10">
        <Header1 className="">Run {run.id}</Header1>
        <div className="flex gap-2">
          {run.isTest && (
            <Body
              size="extra-small"
              className="flex items-center pl-2 pr-3 py-0.5 rounded uppercase tracking-wide text-slate-500"
            >
              <BeakerIcon className="h-4 w-4 mr-1" />
              Test Run
            </Body>
          )}
          <PrimaryButton>
            <ArrowPathRoundedSquareIcon className="h-5 w-5 -ml-1" />
            Rerun
          </PrimaryButton>
        </div>
      </div>

      <ul className="flex gap-6 ml-[-3px]">
        <li className="flex gap-2 items-center">
          {runStatusIcon(run.status, "large")}
          <Header2 size="small" className="text-slate-400">
            {runStatusLabel(run.status)}
          </Header2>
        </li>
        <li className="flex gap-1 items-center">
          <Header2 size="small" className="text-slate-400">
            {run.startedAt &&
              `Started: ${formatDateTime(run.startedAt, "long")}`}
          </Header2>
        </li>
        {run.duration && (
          <li className="flex gap-1 items-center">
            <Header2 size="small" className="text-slate-400">
              Duration: {humanizeDuration(run.duration)}
            </Header2>
          </li>
        )}
      </ul>

      <TriggerStep trigger={run.trigger} />

      {run.steps
        .filter((s) => s.type !== "OUTPUT")
        .map((step, index) => (
          <WorkflowStep key={index} step={step} />
        ))}

      {run.status === "SUCCESS" && (
        <Panel>
          <div className="flex gap-2 items-center border-b border-slate-700 pb-3 mb-4">
            <CheckCircleIcon className="h-5 w-5 text-green-500" />
            <Body size="small" className="text-slate-300">
              Run {run.id} complete
            </Body>
          </div>
          <div className="grid grid-cols-3 gap-2 text-slate-300">
            <div className="flex flex-col gap-1">
              <Body size="extra-small" className={workflowNodeUppercaseClasses}>
                Run duration:
              </Body>
              <Body className={workflowNodeDelayClasses} size="small">
                {run.duration && humanizeDuration(run.duration)}
              </Body>
            </div>
            <div className="flex flex-col gap-1">
              <Body size="extra-small" className={workflowNodeUppercaseClasses}>
                Started:
              </Body>
              <Body className={workflowNodeDelayClasses} size="small">
                {run.startedAt && formatDateTime(run.startedAt, "long")}
              </Body>
            </div>
            <div className="flex flex-col gap-1">
              <Body size="extra-small" className={workflowNodeUppercaseClasses}>
                Completed:
              </Body>
              <Body className={workflowNodeDelayClasses} size="small">
                {run.finishedAt && formatDateTime(run.finishedAt, "long")}
              </Body>
            </div>
          </div>
          {output && (
            <CodeBlock
              code={stringifyCode(output.output)}
              language="json"
              className="mt-2"
              align="top"
            />
          )}
        </Panel>
      )}

      {run.error && <Error error={run.error} />}
    </>
  );
}

function stringifyCode(obj: any) {
  return JSON.stringify(obj, null, 2);
}

const workflowNodeFlexClasses = "flex gap-1 items-baseline";
const workflowNodeUppercaseClasses = "uppercase text-slate-400";
const workflowNodeDelayClasses = "flex rounded-md bg-[#0F172A] p-3";

function TriggerStep({ trigger }: { trigger: Trigger }) {
  return (
    <Panel className="mt-4">
      <StepHeader
        icon={triggerInfo[trigger.type].icon}
        title={triggerInfo[trigger.type].label}
        startedAt={trigger.startedAt}
        finishedAt={null}
        // integration={trigger.type === "WEBHOOK"}
      />
      <TriggerBody trigger={trigger} />
    </Panel>
  );
}

function WorkflowStep({ step }: { step: Step }) {
  return (
    <div className="flex items-stretch w-full">
      <div className="relative flex w-5 border-l border-slate-700 ml-2.5">
        <div className="absolute top-6 -left-[18px] p-1 bg-slate-850 rounded-full">
          {runStatusIcon(step.status, "large")}
        </div>
      </div>
      <StepPanel status={step.status}>
        <StepHeader
          icon={stepInfo[step.type].icon}
          title={stepInfo[step.type].label}
          startedAt={step.startedAt}
          finishedAt={step.finishedAt}
          // integration={trigger.type === "WEBHOOK"}
        />
        <StepBody step={step} />
      </StepPanel>
    </div>
  );
}

function StepPanel({
  status,
  children,
}: {
  status: WorkflowRunStatus;
  children: ReactNode;
}) {
  let borderClass = "border-slate-800";
  switch (status) {
    case "ERROR":
      borderClass = "border-red-700";
      break;
    case "PENDING":
      borderClass = "border-blue-700";
      break;
  }

  return <Panel className={`border ${borderClass} my-4`}>{children}</Panel>;
}

function StepHeader({
  icon,
  title,
  startedAt,
  finishedAt,
  integration,
}: {
  icon: ReactNode;
  title: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  integration?: {
    name: string;
    logoUrl: string;
  };
}) {
  return (
    <div className="flex mb-4 pb-3 justify-between items-center border-b border-slate-700">
      <div className="flex gap-1 items-center">
        {icon}
        <Body size="small" className="uppercase text-slate-400 font-semibold">
          {title}
        </Body>
      </div>
      <ul className="flex justify-end items-center gap-4">
        <div className={workflowNodeFlexClasses}>
          {startedAt && (
            <Body size="small">{formatDateTime(startedAt, "long")}</Body>
          )}
          {startedAt &&
            finishedAt &&
            dateDifference(startedAt, finishedAt) > 1 && (
              <>
                <Body
                  size="extra-small"
                  className={workflowNodeUppercaseClasses}
                >
                  <ArrowRightIcon className="h-3 w-3" />
                </Body>
                <Body size="small">{formatDateTime(finishedAt, "long")}</Body>
              </>
            )}
        </div>

        {integration && (
          <li className="flex gap-2 items-center">
            <Body size="small">{integration.name}</Body>
            <img
              src={integration.logoUrl}
              alt={integration.name}
              className="h-8 shadow"
            />
          </li>
        )}
      </ul>
    </div>
  );
}

function TriggerBody({ trigger }: { trigger: Trigger }) {
  switch (trigger.type) {
    case "WEBHOOK":
      return <Webhook webhook={trigger} />;
    case "SCHEDULE":
      break;
    case "CUSTOM_EVENT":
      return <CustomEventTrigger event={trigger} />;
    case "HTTP_ENDPOINT":
      break;
    default:
      break;
  }
  return <></>;
}

function StepBody({ step }: { step: Step }) {
  switch (step.type) {
    case "LOG_MESSAGE":
      return <Log log={step} />;
    case "CUSTOM_EVENT":
      return <CustomEventStep event={step} />;
  }
  return <></>;
}

function Webhook({ webhook }: { webhook: TriggerType<Trigger, "WEBHOOK"> }) {
  console.log(webhook);
  return (
    <>
      <Header3 size="large" className="mb-2">
        {webhook.name}
      </Header3>
      <div className="flex flex-col gap-1 mb-2">
        {webhook.source &&
          Object.entries(webhook.source).map(([key, value]) => (
            <div key={key} className="flex gap-2 items-baseline">
              <Body size="extra-small" className={workflowNodeUppercaseClasses}>
                {key}
              </Body>
              <Body size="small">{value}</Body>
            </div>
          ))}
      </div>
      {webhook.input && (
        <CodeBlock
          code={stringifyCode(webhook.input)}
          align="top"
          maxHeight="150px"
        />
      )}
    </>
  );
}

// function Delay({ step }: { step: DelayStep }) {
//   return (
//     <div className="grid grid-cols-3 gap-2 text-slate-300">
//       <div className="flex flex-col gap-1">
//         <Body size="extra-small" className={workflowNodeUppercaseClasses}>
//           Total delay:
//         </Body>
//         <Body className={workflowNodeDelayClasses} size="small">
//           3 days 5 hrs 30 mins 10 secs
//         </Body>
//       </div>
//       <div className="flex flex-col gap-1">
//         <Body size="extra-small" className={workflowNodeUppercaseClasses}>
//           Fires at:
//         </Body>
//         <Body className={workflowNodeDelayClasses} size="small">
//           3:45pm Dec 22 2022
//         </Body>
//       </div>
//       <div className="flex flex-col gap-1">
//         <Body size="extra-small" className={workflowNodeUppercaseClasses}>
//           Fires in:
//         </Body>
//         <Body className={workflowNodeDelayClasses} size="small">
//           2 days 16 hours 30 mins 10 secs
//         </Body>
//       </div>
//     </div>
//   );
// }

function CustomEventTrigger({
  event,
}: {
  event: TriggerType<Trigger, "CUSTOM_EVENT">;
}) {
  return (
    <>
      <Header2 size="large" className="mb-4">
        name: {event.name}
      </Header2>
      {event.input && <CodeBlock code={stringifyCode(event.input)} />}
    </>
  );
}

function CustomEventStep({ event }: { event: StepType<Step, "CUSTOM_EVENT"> }) {
  return (
    <>
      <Header2 size="large" className="mb-4">
        name: {event.input.name}
      </Header2>
      <Header4>Payload</Header4>
      <CodeBlock code={stringifyCode(event.input.payload)} align="top" />
      {event.input.context && (
        <>
          <Header4>Context</Header4>
          <CodeBlock code={stringifyCode(event.input.context)} align="top" />
        </>
      )}
    </>
  );
}

// function Email({ email }: { email: string }) {
//   return <CodeBlock code={email} />;
// }

function Log({ log }: { log: StepType<Step, "LOG_MESSAGE"> }) {
  return (
    <>
      <Body className="font-mono" size="small">
        <span className={"uppercase text-small text-slate-500"}>
          {log.input.level}:
        </span>
      </Body>
      <Header4
        className={classNames("mb-2 font-mono", logColor[log.input.level])}
      >
        {log.input.message}
      </Header4>

      <CodeBlock code={stringifyCode(log.input.properties)} align="top" />
    </>
  );
}

function Error({ error }: { error: Run["error"] }) {
  if (!error) return null;

  return (
    <>
      <div className="flex gap-2 mb-2 mt-3 ">
        <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
        <Body size="small" className="text-slate-300">
          Failed with error:
        </Body>
      </div>
      <Panel className="border border-red-600">
        <Header4 className="font-mono">
          {error.name}: {error.message}
        </Header4>
        {error.stackTrace && (
          <div className="mt-2">
            <CodeBlock code={error.stackTrace} language="json" align="top" />
          </div>
        )}
      </Panel>
    </>
  );
}

const styleClass = "h-6 w-6 text-slate-400";
const stepInfo: Record<Step["type"], { label: string; icon: ReactNode }> = {
  LOG_MESSAGE: {
    label: "Log",
    icon: <ChatBubbleLeftEllipsisIcon className={styleClass} />,
  },
  CUSTOM_EVENT: {
    label: "Fire custom event",
    icon: <BoltIcon className={styleClass} />,
  },
  OUTPUT: { label: "Output", icon: <></> },
} as const;

const triggerInfo: Record<Trigger["type"], { label: string; icon: ReactNode }> =
  {
    CUSTOM_EVENT: {
      label: "Custom event",
      icon: <BarsArrowDownIcon className={styleClass} />,
    },
    WEBHOOK: {
      label: "Webhook",
      icon: <DocumentTextIcon className={styleClass} />,
    },
    HTTP_ENDPOINT: {
      label: "HTTP endpoint",
      icon: <DocumentTextIcon className={styleClass} />,
    },
    SCHEDULE: {
      label: "Scheduled",
      icon: <CalendarDaysIcon className={styleClass} />,
    },
  } as const;

type LogLevel = StepType<Step, "LOG_MESSAGE">["input"]["level"];
const logColor: Record<LogLevel, string> = {
  INFO: "text-slate-300",
  WARN: "text-yellow-300",
  ERROR: "text-red-300",
  DEBUG: "text-slate-300",
} as const;
