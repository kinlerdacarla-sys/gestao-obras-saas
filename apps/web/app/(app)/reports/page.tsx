import { FeatureAccess } from "../../../components/feature-access";
import { Reports } from "../../../components/analytics/reports";
export default function Page() {
  return <FeatureAccess feature="ADVANCED_REPORTS" advisory><Reports /></FeatureAccess>;
}
