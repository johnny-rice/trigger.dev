import {
  ArrowUpCircleIcon,
  BookOpenIcon,
  ChatBubbleLeftEllipsisIcon,
  PauseIcon,
  PlayIcon,
  RectangleStackIcon,
} from "@heroicons/react/20/solid";
import { Await, Form, type MetaFunction } from "@remix-run/react";
import { type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/server-runtime";
import { Suspense } from "react";
import { typeddefer, useTypedLoaderData } from "remix-typedjson";
import { z } from "zod";
import { TaskIcon } from "~/assets/icons/TaskIcon";
import { AdminDebugTooltip } from "~/components/admin/debugTooltip";
import { Feedback } from "~/components/Feedback";
import { PageBody, PageContainer } from "~/components/layout/AppLayout";
import { BigNumber } from "~/components/metrics/BigNumber";
import { Button, LinkButton } from "~/components/primitives/Buttons";
import { NavBar, PageAccessories, PageTitle } from "~/components/primitives/PageHeader";
import { PaginationControls } from "~/components/primitives/Pagination";
import { Spinner } from "~/components/primitives/Spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from "~/components/primitives/Table";
import { useEnvironment } from "~/hooks/useEnvironment";
import { useOrganization } from "~/hooks/useOrganizations";
import { findProjectBySlug } from "~/models/project.server";
import { findEnvironmentBySlug } from "~/models/runtimeEnvironment.server";
import { QueueListPresenter } from "~/presenters/v3/QueueListPresenter.server";
import { requireUserId } from "~/services/session.server";
import { cn } from "~/utils/cn";
import { docsPath, EnvironmentParamSchema, v3BillingPath } from "~/utils/pathBuilder";
import { PauseEnvironmentService } from "~/v3/services/pauseEnvironment.server";
import { useCurrentPlan } from "../_app.orgs.$organizationSlug/route";
import { redirectWithErrorMessage, redirectWithSuccessMessage } from "~/models/message.server";
import { EnvironmentQueuePresenter } from "~/presenters/v3/EnvironmentQueuePresenter.server";

const SearchParamsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
});

export const meta: MetaFunction = () => {
  return [
    {
      title: `Queues | Trigger.dev`,
    },
  ];
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  const { organizationSlug, projectParam, envParam } = EnvironmentParamSchema.parse(params);

  const url = new URL(request.url);
  const { page } = SearchParamsSchema.parse(Object.fromEntries(url.searchParams));

  const project = await findProjectBySlug(organizationSlug, projectParam, userId);
  if (!project) {
    throw new Response(undefined, {
      status: 404,
      statusText: "Project not found",
    });
  }

  const environment = await findEnvironmentBySlug(project.id, envParam, userId);
  if (!environment) {
    throw new Response(undefined, {
      status: 404,
      statusText: "Environment not found",
    });
  }

  try {
    const queueListPresenter = new QueueListPresenter();
    const result = await queueListPresenter.call({
      environment,
      page,
    });

    const environmentQueuePresenter = new EnvironmentQueuePresenter();

    return typeddefer({
      ...result,
      environment: environmentQueuePresenter.call(environment),
    });
  } catch (error) {
    console.error(error);
    throw new Response(undefined, {
      status: 400,
      statusText: "Something went wrong, if this problem persists please contact support.",
    });
  }
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const userId = await requireUserId(request);
  if (request.method.toLowerCase() !== "post") {
    return redirectWithErrorMessage(
      `/orgs/${params.organizationSlug}/projects/${params.projectParam}/env/${params.envParam}/queues`,
      request,
      "Wrong method"
    );
  }

  const { organizationSlug, projectParam, envParam } = EnvironmentParamSchema.parse(params);

  const project = await findProjectBySlug(organizationSlug, projectParam, userId);
  if (!project) {
    throw new Response(undefined, {
      status: 404,
      statusText: "Project not found",
    });
  }

  const environment = await findEnvironmentBySlug(project.id, envParam, userId);
  if (!environment) {
    throw new Response(undefined, {
      status: 404,
      statusText: "Environment not found",
    });
  }

  const formData = await request.formData();
  const action = formData.get("action");

  switch (action) {
    case "environment-pause":
      const pauseService = new PauseEnvironmentService();
      await pauseService.call(environment, "paused");
      return redirectWithSuccessMessage(
        `/orgs/${organizationSlug}/projects/${projectParam}/env/${envParam}/queues`,
        request,
        "Environment paused"
      );
    case "environment-resume":
      const resumeService = new PauseEnvironmentService();
      await resumeService.call(environment, "resumed");
      return redirectWithSuccessMessage(
        `/orgs/${organizationSlug}/projects/${projectParam}/env/${envParam}/queues`,
        request,
        "Environment resumed"
      );
    default:
      redirectWithErrorMessage(
        `/orgs/${organizationSlug}/projects/${projectParam}/env/${envParam}/queues`,
        request,
        "Something went wrong"
      );
  }
};

export default function Page() {
  const { environment, queues, pagination } = useTypedLoaderData<typeof loader>();

  const organization = useOrganization();
  const env = useEnvironment();
  const plan = useCurrentPlan();

  return (
    <PageContainer>
      <NavBar>
        <PageTitle title="Queues" />
        <PageAccessories>
          <AdminDebugTooltip />
          <LinkButton
            variant={"docs/small"}
            LeadingIcon={BookOpenIcon}
            to={docsPath("/queue-concurrency")}
          >
            Queues docs
          </LinkButton>
        </PageAccessories>
      </NavBar>
      <PageBody scrollable={false}>
        <div className="flex flex-col">
          <div className="grid grid-cols-3 gap-3 p-3">
            <Suspense fallback={<BigNumber title="Queued" loading={true} />}>
              <Await resolve={environment}>
                {(environment) => (
                  <BigNumber
                    title="Queued"
                    value={environment.queued}
                    suffix={env.paused && environment.queued > 0 ? "paused" : undefined}
                    animate
                    accessory={<EnvironmentPauseResumeButton env={env} />}
                    valueClassName={env.paused ? "text-amber-500" : undefined}
                  />
                )}
              </Await>
            </Suspense>
            <Suspense fallback={<BigNumber title="Running" loading={true} />}>
              <Await resolve={environment}>
                {(environment) => <BigNumber title="Running" value={environment.running} animate />}
              </Await>
            </Suspense>
            <Suspense fallback={<BigNumber title="Concurrency limit" loading={true} />}>
              <Await resolve={environment}>
                {(environment) => (
                  <BigNumber
                    title="Concurrency limit"
                    value={environment.concurrencyLimit}
                    animate
                    accessory={
                      plan ? (
                        plan?.v3Subscription?.plan?.limits.concurrentRuns.canExceed ? (
                          <Feedback
                            button={
                              <Button
                                variant="tertiary/small"
                                LeadingIcon={ChatBubbleLeftEllipsisIcon}
                                leadingIconClassName="text-indigo-500"
                              >
                                Increase limit
                              </Button>
                            }
                            defaultValue="help"
                          />
                        ) : (
                          <LinkButton
                            to={v3BillingPath(
                              organization,
                              "Upgrade your plan for more concurrency"
                            )}
                            variant="secondary/small"
                            LeadingIcon={ArrowUpCircleIcon}
                            leadingIconClassName="text-indigo-500"
                          >
                            Increase limit
                          </LinkButton>
                        )
                      ) : null
                    }
                  />
                )}
              </Await>
            </Suspense>
          </div>

          <Table containerClassName="border-t">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell alignment="right">Queued</TableHeaderCell>
                <TableHeaderCell alignment="right">Running</TableHeaderCell>
                <TableHeaderCell alignment="right">Concurrency limit</TableHeaderCell>
                <TableHeaderCell alignment="right">
                  <span className="sr-only">Pause/resume</span>
                </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              <Suspense
                fallback={
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="grid place-items-center py-6">
                        <Spinner />
                      </div>
                    </TableCell>
                  </TableRow>
                }
              >
                <Await
                  resolve={Promise.all([queues, environment])}
                  errorElement={<p>Error loading queues</p>}
                >
                  {([queues, environment]) =>
                    queues.length > 0 ? (
                      queues.map((queue) => (
                        <TableRow key={queue.name}>
                          <TableCell>
                            <span className="flex items-center gap-2">
                              {queue.type === "VIRTUAL" ? (
                                <TaskIcon className="size-4 text-blue-500" />
                              ) : (
                                <RectangleStackIcon className="size-4 text-purple-500" />
                              )}
                              <span>{queue.name}</span>
                            </span>
                          </TableCell>
                          <TableCell alignment="right">{queue.queued}</TableCell>
                          <TableCell alignment="right">{queue.running}</TableCell>
                          <TableCell alignment="right">
                            {queue.concurrencyLimit ?? (
                              <span className="text-text-dimmed">
                                Max ({environment.concurrencyLimit})
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <div className="grid place-items-center py-6 text-text-dimmed">
                            No queues found
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  }
                </Await>
              </Suspense>
            </TableBody>
          </Table>

          <div
            className={cn(
              "grid h-fit max-h-full min-h-full overflow-x-auto",
              pagination.totalPages > 1 ? "grid-rows-[1fr_auto]" : "grid-rows-[1fr]"
            )}
          >
            <div
              className={cn(
                "flex min-h-full",
                pagination.totalPages > 1 && "justify-end border-t border-grid-dimmed px-2 py-3"
              )}
            >
              <PaginationControls
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
              />
            </div>
          </div>
        </div>
      </PageBody>
    </PageContainer>
  );
}

function EnvironmentPauseResumeButton({ env }: { env: { paused: boolean } }) {
  return (
    <Form method="post">
      <input
        type="hidden"
        name="action"
        value={env.paused ? "environment-resume" : "environment-pause"}
      />
      <Button
        type="submit"
        variant="tertiary/small"
        LeadingIcon={env.paused ? PlayIcon : PauseIcon}
        leadingIconClassName={env.paused ? "text-success" : "text-amber-500"}
      >
        {env.paused ? "Resume" : "Pause environment"}
      </Button>
    </Form>
  );
}

export function isEnvironmentPauseResumeFormSubmission(
  formMethod: string | undefined,
  formData: FormData | undefined
) {
  if (!formMethod || !formData) {
    return false;
  }

  return (
    formMethod.toLowerCase() === "post" &&
    (formData.get("action") === "environment-pause" ||
      formData.get("action") === "environment-resume")
  );
}
