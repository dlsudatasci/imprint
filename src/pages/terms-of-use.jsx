import Page from '@/ui/page';
import Link from 'next/link';
import { Shield, Info, CheckCircle, Eye, Database, FileKey, ShieldCheck } from 'lucide-react';

export default function TermsOfUse() {
    return (
        <Page
            title="Terms of Use - Imprint"
            description="This is our terms of use and privacy policy for using Imprint."
            contribute={false}
        >
            <section className='container mx-auto p-4 my-12 mb-32 flex flex-col items-center justify-center animate-in fade-in duration-500'>
                <div className='w-full sm:w-11/12 md:w-11/12 lg:w-10/12 xl:w-9/12 bg-white rounded-[2rem] shadow-[0_4px_40px_rgb(0,0,0,0.06)] border border-gray-100 p-8 sm:p-14 relative overflow-hidden'>

                    {/* Decorative Header Banner */}
                    <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-blue-50 to-indigo-50/50 pointer-events-none" />

                    <div className="relative z-10">
                        <div className="w-16 h-16 bg-white shadow-sm border border-gray-100 rounded-2xl flex items-center justify-center text-primary mb-8 mt-2">
                            <Shield className="w-8 h-8" />
                        </div>

                        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-4">Terms of Use & Privacy Policy</h1>
                        <p className="text-lg text-gray-600 leading-relaxed mb-12 border-b border-gray-100 pb-10">
                            This terms of use and privacy policy will help you understand how
                            <Link href="https://dlsucomet.github.io/" target="_blank" className="font-bold text-primary hover:text-[#004aad] transition-colors ml-1 mr-1 hover:underline">Human-X Interaction Lab</Link>
                            and student researchers will use and protect the data you provide to us when you visit and use Imprint.
                        </p>

                        <div className="space-y-12 text-gray-700 leading-relaxed">
                            {/* Section 1 */}
                            <div>
                                <h3 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
                                    <Info className="w-6 h-6 text-blue-500" />
                                    Overview
                                </h3>
                                <p>
                                    Greetings! I am Francis Bawa and I&apos;m currently working on my Master&apos;s thesis at De La Salle University titled &quot;Leveraging Human-in-the-Loop Crowdsourcing to Support Richer Human Perception Data Collection in Streetscape Evaluation&quot;. In this study, I&apos;m trying to ....
                                </p>
                            </div>

                            {/* Section 2 */}
                            <div>
                                <h3 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
                                    <CheckCircle className="w-6 h-6 text-green-500" />
                                    Procedure
                                </h3>
                                <p className="mb-4">Register to Imprint through the &quot;Contribute&quot; Page, and provide the following:</p>
                                <ul className="list-disc pl-6 space-y-2 mb-6">
                                    <li>Username</li>
                                    <li>Email address</li>
                                    <li>Password</li>
                                    <li>City of Residence</li>
                                    <li>Frequently Walked Cities</li>
                                    <li>Age</li>
                                    <li>Frequency of walking during your usual commute</li>
                                </ul>

                                <p className="mb-4">
                                    After registering for the annotation task, you may continue on to annotate street view images in the website.
                                    You are to:
                                </p>
                                <ul className="list-disc pl-6 space-y-2">
                                    <li>Select obstructions that can be found along the sidewalk</li>
                                    <li>Create new bounding boxes around obstructions that have not yet been annotated</li>
                                    <li>Rate the sidewalk accessibility from 1 to 10</li>
                                    <li>Determine the surface type of the sidewalk, or if there is no sidewalk present in the image</li>
                                </ul>
                            </div>

                            {/* Section 3 */}
                            <div>
                                <h3 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
                                    <Eye className="w-6 h-6 text-indigo-500" />
                                    Informed Consent
                                </h3>
                                <p className="mb-4">By participating in our study, you agree to the following:</p>
                                <ul className="list-disc pl-6 space-y-2">
                                    <li>I agree to participate in the data collection procedure of this study.</li>
                                    <li>I have read and understood the background of the research and procedure for the annotation task, as indicated in the overview and procedure section.</li>
                                    <li>I acknowledge that I have been provided with the opportunity to ask questions and request for clarifications regarding the research study.</li>
                                    <li>I understand that my participation is completely voluntary and that I have the right to withdraw my participation at any time.</li>
                                    <li>I understand that all my user data will be kept confidential and will only be used by the proponents of this research.</li>
                                </ul>
                            </div>

                            {/* Section 4 */}
                            <div>
                                <h3 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
                                    <Database className="w-6 h-6 text-purple-500" />
                                    What User Data Imprint Collects
                                </h3>
                                <p className="mb-4">When you visit the website, Imprint may collect the following data:</p>
                                <ul className="list-disc pl-6 space-y-2">
                                    <li>Your email address and password used for this website.</li>
                                    <li>Other information such as city of residence, frequently walked cities, age, usage of mobility aids, frequency of commuting in a public utility vehicle.</li>
                                    <li>Your user activities such as the images you will annotate using our website.</li>
                                </ul>
                            </div>

                            {/* Section 5 */}
                            <div>
                                <h3 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
                                    <FileKey className="w-6 h-6 text-amber-500" />
                                    Why Imprint Collects Your Data
                                </h3>
                                <p className="mb-4">Imprint collects your data for several reasons:</p>
                                <ul className="list-disc pl-6 space-y-2">
                                    <li>To better understand the profile/background of our users.</li>
                                    <li>To improve our research on the accessibility of sidewalks in the Philippines.</li>
                                </ul>
                            </div>

                            {/* Section 6 */}
                            <div>
                                <h3 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
                                    <ShieldCheck className="w-6 h-6 text-emerald-500" />
                                    Safeguarding and Securing the Data
                                </h3>
                                <p>
                                    The student researchers are committed to securing your data and keeping it confidential.
                                    They have done all in its power to prevent data theft, unauthorized access, and disclosure by implementing the latest
                                    technologies and software, which help safeguard all the information Imprint collects. The student researchers will not lease,
                                    sell or distribute your personal information to any third parties; all the information will solely be for the purpose of
                                    our research.
                                </p>
                            </div>

                            {/* Section 7 */}
                            <div>
                                <h3 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
                                    <Shield className="w-6 h-6 text-red-500" />
                                    Restricting the Collection of your Personal Data
                                </h3>
                                <p>
                                    At some point, you might wish to restrict the use and collection of your personal data. If you have already agreed to share your information with us, feel free to contact via email, and I will be more than happy to change this for you.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </Page>
    );
}
